import { AiSettings } from '../../components/AiSettings';
import { SettingsPage } from './SettingsPage';

export function AiPage() {
  return (
    <SettingsPage
      title="AI Helper"
      hint="Optional. AI can tidy up pasted recipes, sort unknown items into aisles and suggest swaps. Your key stays on this device, is sent only to the provider you choose, and is never included in backups."
    >
      <AiSettings />
    </SettingsPage>
  );
}
