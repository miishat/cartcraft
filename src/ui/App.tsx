import { AislesPage } from './screens/settings/AislesPage';
import { AppearancePage } from './screens/settings/AppearancePage';
import { ServingsPage } from './screens/settings/ServingsPage';
import { UnitsPage } from './screens/settings/UnitsPage';
import { Navigate, Route, Routes } from 'react-router';
import { Layout } from './Layout';
import { ListScreen } from './screens/ListScreen';
import { ListsScreen } from './screens/ListsScreen';
import { RecipeEditorScreen } from './screens/RecipeEditorScreen';
import { RecipeViewScreen } from './screens/RecipeViewScreen';
import { RecipesScreen } from './screens/RecipesScreen';
import { SettingsScreen } from './screens/SettingsScreen';

/** All routes. Wrapped in a router and DbProvider by main.tsx (or by tests). */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<RecipesScreen />} />
        <Route path="recipes/new" element={<RecipeEditorScreen />} />
        <Route path="recipes/:id/view" element={<RecipeViewScreen />} />
        <Route path="recipes/:id" element={<RecipeEditorScreen />} />
        <Route path="lists" element={<ListsScreen />} />
        <Route path="lists/:id" element={<ListScreen />} />
        <Route path="settings" element={<SettingsScreen />} />
        <Route path="settings/appearance" element={<AppearancePage />} />
        <Route path="settings/units" element={<UnitsPage />} />
        <Route path="settings/servings" element={<ServingsPage />} />
        <Route path="settings/aisles" element={<AislesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
