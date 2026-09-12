import { Route, Routes, Navigate } from 'react-router-dom';

import LibraryPage from '~/pages/LibraryPage';
import ProjectPage from '~/pages/ProjectPage';
import ModpackPage from '~/pages/ModpackPage';
import InstancePage from '~/pages/InstancePage';
import DiscoverPage from '~/pages/DiscoverPage';
import SettingsPage from '~/pages/SettingsPage';
import Layout from '~/components/commons/Layout';
import DownloadsPage from '~/pages/DownloadsPage';
import SharedModpackPage from '~/pages/SharedModpackPage';

const App = () => (
  <Routes>
    <Route element={<Layout />}>
      <Route path="/" element={<LibraryPage />} />
      <Route path="/library" element={<Navigate to="/" replace />} />
      <Route element={<InstancePage />} path="/instance/:instanceId" />
      <Route path="/discover" element={<DiscoverPage />} />
      <Route element={<ProjectPage />} path="/project/:projectId" />
      <Route path="/modpacks" element={<Navigate to="/" replace />} />
      <Route element={<ModpackPage />} path="/modpack/:modpackId" />
      <Route path="/share/:shareId" element={<SharedModpackPage />} />
      <Route path="/downloads" element={<DownloadsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>
);

export default App;
