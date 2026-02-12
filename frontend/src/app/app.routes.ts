import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { guestGuard } from './guards/guest.guard';

export const routes: Routes = [
    {
        path: '',
        loadComponent: () =>
            import('./pages/landing/landing.component').then((m) => m.LandingComponent),
        canActivate: [guestGuard],
    },
    {
        path: 'home',
        loadComponent: () =>
            import('./pages/home/home.component').then((m) => m.HomeComponent),
        canActivate: [authGuard],
    },
    {
        path: 'login',
        loadComponent: () =>
            import('./pages/login/login.component').then((m) => m.LoginComponent),
        canActivate: [guestGuard],
    },
    {
        path: 'register',
        loadComponent: () =>
            import('./pages/register/register.component').then((m) => m.RegisterComponent),
        canActivate: [guestGuard],
    },
    {
        path: 'verify',
        loadComponent: () =>
            import('./pages/verify/verify.component').then((m) => m.VerifyComponent),
    },
    {
        path: 'communities',
        loadComponent: () =>
            import('./pages/communities/communities.component').then((m) => m.CommunitiesComponent),
        canActivate: [authGuard],
    },
    {
        path: 'community/:slug',
        loadComponent: () =>
            import('./pages/community-detail/community-detail.component').then(
                (m) => m.CommunityDetailComponent
            ),
        canActivate: [authGuard],
    },
    {
        path: 'proposals/new',
        loadComponent: () =>
            import('./pages/proposal-create/proposal-create.component').then(
                (m) => m.ProposalCreateComponent
            ),
        canActivate: [authGuard],
    },
    {
        path: 'proposal/:id',
        loadComponent: () =>
            import('./pages/proposal-detail/proposal-detail.component').then(
                (m) => m.ProposalDetailComponent
            ),
        canActivate: [authGuard],
    },
    {
        path: 'admin',
        loadComponent: () =>
            import('./pages/admin-dashboard/admin-dashboard.component').then(
                (m) => m.AdminDashboardComponent
            ),
        canActivate: [authGuard],
    },
    {
        path: 'users',
        loadComponent: () =>
            import('./pages/user-search/user-search.component').then(
                (m) => m.UserSearchComponent
            ),
        canActivate: [authGuard],
    },
    {
        path: 'user/:id',
        loadComponent: () =>
            import('./pages/user-profile/user-profile.component').then(
                (m) => m.UserProfileComponent
            ),
        canActivate: [authGuard],
    },
    {
        path: '**',
        redirectTo: '',
    },
];
