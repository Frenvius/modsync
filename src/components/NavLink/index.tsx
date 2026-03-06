import { forwardRef } from 'react';
import { cn } from '~/usecase/util/stringUtils';
import { NavLink as RouterNavLink, NavLinkProps } from 'react-router-dom';

interface NavLinkCompatProps extends Omit<NavLinkProps, 'className'> {
	className?: string;
	activeClassName?: string;
	pendingClassName?: string;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(({ to, className, activeClassName, pendingClassName, ...props }, ref) => {
	return (
		<RouterNavLink
			to={to}
			ref={ref}
			className={({ isActive, isPending }) => cn(className, isActive && activeClassName, isPending && pendingClassName)}
			{...props}
		/>
	);
});

NavLink.displayName = 'NavLink';

export { NavLink };
