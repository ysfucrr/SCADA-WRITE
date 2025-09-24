import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';





export async function middleware(request: NextRequest) {
    // Printing to console for debugging
    console.log('Middleware running - path:', request.nextUrl.pathname);

    const pathname = request.nextUrl.pathname;
    console.log("pathname: ", pathname)

    if (pathname.startsWith('/no-license')) {
        return NextResponse.next();
    }
    const license = request.cookies.get('licenseValid')?.value;
    console.log("license: ", license, typeof license)
    const url = request.nextUrl.clone();

    if (license !== 'true' && url.pathname !== '/no-license') {
        console.log("license not valid")
        url.pathname = '/no-license';
        return NextResponse.redirect(url);
    }


    // Special check for signin page
    if (pathname === '/signin') {
        const token: any = await getToken({ req: request });
        console.log("token: ", token)
        if (token) {
            const user = token

            if (user && user.role === 'admin') {
                const response = await fetch('/api/initial-admin');
                const data = await response.json();
                console.log("has admin: ", data)
                if (data.hasAdmin) {
                    const redirectUrl = new URL('/home', request.url);
                    redirectUrl.searchParams.set('source', 'redirect');
                    return NextResponse.redirect(redirectUrl);
                }else{
                    return NextResponse.redirect(new URL('/setup-admin', request.url));
                }
            } else {
                // Redirect all users to home page, regardless of their permissions
                console.log("User is being redirected to home page")
                const redirectUrl = new URL('/home', request.url);
                redirectUrl.searchParams.set('source', 'redirect');
                return NextResponse.redirect(redirectUrl);
            }
            // Redirect to home page if a logged-in user tries to access the signin page
            const redirectUrl = new URL('/home', request.url);
            redirectUrl.searchParams.set('source', 'redirect');
            return NextResponse.redirect(redirectUrl);
        }
        return NextResponse.next();
    } else {
        const token: any = await getToken({ req: request });
        console.log("token: ", token)
        if (token) {
            const user = token

            if (user && user.role === 'admin') {
                if (pathname === "/") {
                    const redirectUrl = new URL('/home', request.url);
                    redirectUrl.searchParams.set('source', 'redirect');
                    return NextResponse.redirect(redirectUrl);
                }
                return NextResponse.next();

            } else if (user) {
                console.log("user: ", user)
                //check permissions

                if (pathname.startsWith('/billing') || pathname === '/' || pathname.startsWith('/home')) {
                    console.log("billing: ", pathname)
                    
                    // If URL has 'source=redirect' parameter, don't redirect again
                    // This prevents infinite redirection loops
                    if (request.nextUrl.searchParams.get('source') === 'redirect') {
                        console.log("Already redirected, continue")
                        return NextResponse.next();
                    }
                    
                    if (user.permissions?.billing) {
                        console.log("billing")
                        if (pathname === "/") {
                            const redirectUrl = new URL('/home', request.url);
                            redirectUrl.searchParams.set('source', 'redirect');
                            return NextResponse.redirect(redirectUrl);
                        }
                        // Also redirect /billing to /home
                        if (pathname === "/billing") {
                            const redirectUrl = new URL('/home', request.url);
                            redirectUrl.searchParams.set('source', 'redirect');
                            return NextResponse.redirect(redirectUrl);
                        }
                        return NextResponse.next();
                    } else {
                        // If no billing permission, redirect directly to System Health tab
                        const redirectUrl = new URL('/home', request.url);
                        redirectUrl.searchParams.set('source', 'redirect');
                        return NextResponse.redirect(redirectUrl);
                    }
                }
                if (pathname.startsWith('/trend-log')) {
                    console.log("trendLog", pathname)
                    if (user.permissions?.trendLog) {
                        return NextResponse.next();
                    }
                    // If no TrendLog access, redirect to System Health tab
                    // If already coming from a redirect source, continue with NextResponse.next()
                    if (request.nextUrl.searchParams.get('source') === 'redirect') {
                        console.log("Already redirected, continue")
                        return NextResponse.next();
                    }
                    const redirectUrl = new URL('/home', request.url);
                    redirectUrl.searchParams.set('source', 'redirect');
                    return NextResponse.redirect(redirectUrl);
                }
                if (pathname.startsWith('/users')) {
                    console.log("users", pathname)
                    if (user.permissions?.users) {
                        return NextResponse.next();
                    }
                    // If no users permission, redirect to System Health tab
                    // If already coming from a redirect source, continue with NextResponse.next()
                    if (request.nextUrl.searchParams.get('source') === 'redirect') {
                        console.log("Already redirected, continue")
                        return NextResponse.next();
                    }
                    const redirectUrl = new URL('/home', request.url);
                    redirectUrl.searchParams.set('source', 'redirect');
                    return NextResponse.redirect(redirectUrl);
                }
                if (pathname.startsWith('/units')) {
                    console.log("units", pathname)
                    if (user.permissions?.units) {
                        return NextResponse.next();
                    }
                    // If no units permission, redirect to System Health tab
                    // If already coming from a redirect source, continue with NextResponse.next()
                    if (request.nextUrl.searchParams.get('source') === 'redirect') {
                        console.log("Already redirected, continue")
                        return NextResponse.next();
                    }
                    const redirectUrl = new URL('/home', request.url);
                    redirectUrl.searchParams.set('source', 'redirect');
                    return NextResponse.redirect(redirectUrl);
                }

                if (pathname.startsWith('/buildings')) {
                    if (user.buildingPermissions) {
                        if (user.buildingPermissions[pathname.split('/')[2]]) {
                            return NextResponse.next();
                        }
                        // If no building permission, redirect to System Health tab
                        // If already coming from a redirect source, continue with NextResponse.next()
                        if (request.nextUrl.searchParams.get('source') === 'redirect') {
                            console.log("Already redirected, continue")
                            return NextResponse.next();
                        }
                        const redirectUrl = new URL('/home', request.url);
                        redirectUrl.searchParams.set('source', 'redirect');
                        return NextResponse.redirect(redirectUrl);
                    }
                }
                //block admin only routes
                if (pathname.startsWith('/gateway-settings') || pathname.startsWith('/analyzers')) {
                    // For admin-only pages, redirect to System Health tab
                    // If already coming from a redirect source, continue with NextResponse.next()
                    if (request.nextUrl.searchParams.get('source') === 'redirect') {
                        console.log("Already redirected, continue")
                        return NextResponse.next();
                    }
                    const redirectUrl = new URL('/home', request.url);
                    redirectUrl.searchParams.set('source', 'redirect');
                    return NextResponse.redirect(redirectUrl);
                }

                // return NextResponse.redirect(new URL('/error-404', request.url));

            } else {
                return NextResponse.redirect(new URL('/signin', request.url));
            }
        } else {
            return NextResponse.redirect(new URL('/signin', request.url));
        }
    }




}

// Specify which paths the middleware will run for
export const config = {
    matcher: [
        '/',
        '/billing',
        '/home',
        '/signin',
        '/buildings/:path*',
        '/users/:path*',
        '/units/:path*',
        '/template/:path*',
        '/analyzers/:path*',
        '/gateway-settings/:path*',
        '/trend-log/:path*'
    ],
};
