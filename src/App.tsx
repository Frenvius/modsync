import { Route, Routes, Navigate } from 'react-router-dom';

import LibraryPage from '~/pages/LibraryPage';
import ProjectPage from '~/pages/ProjectPage';
import InstancePage from '~/pages/InstancePage';
import DiscoverPage from '~/pages/DiscoverPage';
import SettingsPage from '~/pages/SettingsPage';
import Layout from '~/components/commons/Layout';
import DownloadsPage from '~/pages/DownloadsPage';

const App = () => (
  <Routes>
    <Route element={<Layout />}>
      <Route path="/" element={<LibraryPage />} />
      <Route path="/library" element={<Navigate to="/" replace />} />
      <Route element={<InstancePage />} path="/instance/:instanceId" />
      <Route path="/discover" element={<DiscoverPage />} />
      <Route element={<ProjectPage />} path="/project/:projectId" />
      <Route path="/downloads" element={<DownloadsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>
);

export default App;
