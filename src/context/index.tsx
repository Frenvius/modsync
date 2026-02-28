import AppStateProvider from '~/context/AppState';
import ToastProvider from '~/context/ToastContext';
import { ToastContainer } from '~/components/Toast';
import { AppProvidersProps } from '~/context/types';

const AppProviders = ({ data, update, children }: AppProvidersProps) => {
	return (
		<ToastProvider>
			<AppStateProvider config={data} updateData={update}>
				{children}
				<ToastContainer />
			</AppStateProvider>
		</ToastProvider>
	);
};

export default AppProviders;
