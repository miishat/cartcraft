// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { saveAiKey } from '../../app/ai';
import { createList } from '../../app/lists';
import { draftLinesFromText, saveRecipe } from '../../app/recipes';
import type { CartCraftDb } from '../../data/db';
import { createTestDb, sequentialIds } from '../../test/db';
import { renderRoutes } from '../../test/render';
import { ListScreen } from './ListScreen';

function reply(json: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(json) } }] }), { status }));
}

async function seeded(withKey: boolean): Promise<{ db: CartCraftDb; listId: string }> {
  const db = createTestDb();
  if (withKey) await saveAiKey(db, 'sk-test');
  const ids = sequentialIds('s');
  const text = '1 dragon fruit\n2 onions\n1 pinch saffron';
  const recipeId = await saveRecipe(db, { title: 'Bowl', rawText: text, baseServings: 2, ingredients: draftLinesFromText(text, ids) }, 1, ids);
  const listId = await createList(db, [{ recipeId, targetServings: 2 }], 1, ids);
  return { db, listId };
}

function render(db: CartCraftDb, listId: string, fetchImpl: ReturnType<typeof reply>) {
  return renderRoutes(
    [{ path: '/lists/:id', element: <ListScreen makeId={sequentialIds('n')} now={() => 77} fetchImpl={fetchImpl} /> }],
    `/lists/${listId}`,
    db,
  );
}

describe('ListScreen: AI', () => {
  it('sorts unknown items into aisles', async () => {
    const { db, listId } = await seeded(true);
    const fetchImpl = reply({ assignments: [{ item: 'dragon fruit', aisle: 'produce' }] });
    const { user } = render(db, listId, fetchImpl);

    const button = await screen.findByRole('button', { name: 'Sort 1 unknown item with AI' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    expect(await screen.findByText('Moved 1 item into aisles.')).toBeInTheDocument();
    const produce = screen.getByRole('region', { name: 'Produce' });
    expect(within(produce).getByRole('button', { name: 'Dragon fruit: 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /unknown item/ })).not.toBeInTheDocument();
  });

  it('adds swaps and tips', async () => {
    const { db, listId } = await seeded(true);
    const fetchImpl = reply({ swaps: [{ item: 'saffron', swap: 'a pinch of turmeric' }], tips: ['Freeze leftover onion.'] });
    const { user } = render(db, listId, fetchImpl);

    const button = await screen.findByRole('button', { name: 'Add swaps & tips' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    const section = await screen.findByRole('region', { name: 'Swaps & tips' });
    expect(section).toHaveTextContent('saffron: a pinch of turmeric');
    expect(section).toHaveTextContent('Freeze leftover onion.');
    expect(screen.getByRole('button', { name: 'Refresh swaps & tips' })).toBeInTheDocument();
    expect((await db.lists.get(listId))?.extras?.generatedAt).toBe(77);
  });

  it('shows provider errors inline', async () => {
    const { db, listId } = await seeded(true);
    const { user } = render(db, listId, reply({}, 429));
    const button = await screen.findByRole('button', { name: 'Add swaps & tips' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('rate limiting');
  });

  it('shows only the latest error when sorting fails and then swaps fail', async () => {
    const { db, listId } = await seeded(true);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 429 }))
      .mockResolvedValueOnce(new Response('{}', { status: 500 }));
    const { user } = render(db, listId, fetchImpl as unknown as ReturnType<typeof reply>);
    const sort = await screen.findByRole('button', { name: 'Sort 1 unknown item with AI' });
    await waitFor(() => expect(sort).toBeEnabled());
    await user.click(sort);
    expect(await screen.findByRole('alert')).toHaveTextContent('rate limiting');
    await user.click(screen.getByRole('button', { name: 'Add swaps & tips' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('had a problem'));
    expect(screen.queryByText(/rate limiting/)).not.toBeInTheDocument();
  });

  it('explains how to enable AI without a key', async () => {
    const { db, listId } = await seeded(false);
    render(db, listId, reply({}));
    expect(await screen.findByRole('button', { name: 'Add swaps & tips' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sort 1 unknown item with AI' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Add an AI key in Settings' })).toHaveAttribute('href', '/settings');
  });
});
