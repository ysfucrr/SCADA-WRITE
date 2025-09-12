import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { connectToDatabase } from './lib/mongodb';




export async function middleware(request: NextRequest) {
    // Debug için konsola yazdırma
    console.log('Middleware çalışıyor - yol:', request.nextUrl.pathname);

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


    // Signin sayfası için özel kontrol
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
                if (user.permissions?.dashboard) {
                    console.log("dashboard")
                    const redirectUrl = new URL('/home', request.url);
                    redirectUrl.searchParams.set('source', 'redirect');
                    return NextResponse.redirect(redirectUrl);
                } else if (user.permissions?.units) {
                    console.log("units")
                    return NextResponse.redirect(new URL('/units', request.url));
                } else if (user.permissions?.trendLog) {
                    console.log("trendLog")
                    return NextResponse.redirect(new URL('/trend-log', request.url));
                } else if (user.permissions?.users) {
                    console.log("users")
                    return NextResponse.redirect(new URL('/users', request.url));
                } else if (user.buildingPermissions) {
                    console.log("buildingPermissions")
                    //building permissions is an objecct with map<string, boolean> type, value must be true for the building to be accessible
                    const firstBuildingId = Object.keys(user.buildingPermissions).find(key => user.buildingPermissions[key]);
                    console.log("firstBuildingId: ", firstBuildingId)
                    return NextResponse.redirect(new URL(`/buildings/${firstBuildingId}`, request.url));
                }

            }
            // Giriş yapmış kullanıcı signin sayfasına erişmeye çalışırsa home sayfasına yönlendir
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

                if (pathname.startsWith('/dashboard') || pathname === '/' || pathname.startsWith('/home')) {
                    console.log("dashboard: ", pathname)
                    if (user.permissions?.dashboard) {
                        console.log("dashboard")
                        if (pathname === "/") {
                            const redirectUrl = new URL('/home', request.url);
                            redirectUrl.searchParams.set('source', 'redirect');
                            return NextResponse.redirect(redirectUrl);
                        }
                        // Also redirect /dashboard to /home
                        if (pathname === "/dashboard") {
                            const redirectUrl = new URL('/home', request.url);
                            redirectUrl.searchParams.set('source', 'redirect');
                            return NextResponse.redirect(redirectUrl);
                        }
                        return NextResponse.next();
                    } else {
                        //fallback to first permission
                        if (user.permissions?.trendLog) {
                            return NextResponse.redirect(new URL('/trend-log', request.url));
                        }
                        if (user.permissions?.users) {
                            return NextResponse.redirect(new URL('/users', request.url));
                        }
                        if (user.permissions?.units) {
                            return NextResponse.redirect(new URL('/units', request.url));
                        }
                        if (user.buildingPermissions) {
                            const firstBuildingId = Object.keys(user.buildingPermissions).find(key => user.buildingPermissions[key]);
                            return NextResponse.redirect(new URL(`/buildings/${firstBuildingId}`, request.url));
                        }
                    }
                }
                if (pathname.startsWith('/trend-log')) {
                    console.log("trendLog", pathname)
                    if (user.permissions?.trendLog) {
                        return NextResponse.next();
                    }
                    return NextResponse.redirect(new URL('/access-denied', request.url));
                }
                if (pathname.startsWith('/users')) {
                    console.log("users", pathname)
                    if (user.permissions?.users) {
                        return NextResponse.next();
                    }
                    return NextResponse.redirect(new URL('/access-denied', request.url));
                }
                if (pathname.startsWith('/units')) {
                    console.log("units", pathname)
                    if (user.permissions?.units) {
                        return NextResponse.next();
                    }
                    return NextResponse.redirect(new URL('/access-denied', request.url));
                }

                if (pathname.startsWith('/buildings')) {
                    if (user.buildingPermissions) {
                        if (user.buildingPermissions[pathname.split('/')[2]]) {
                            return NextResponse.next();
                        }
                        return NextResponse.redirect(new URL('/access-denied', request.url));
                    }
                }
                //block admin only routes
                if (pathname.startsWith('/gateway-settings') || pathname.startsWith('/analyzers')) {
                    return NextResponse.redirect(new URL('/access-denied', request.url));
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

// Hangi yollar için middleware'in çalışacağını belirt
export const config = {
    matcher: [
        '/',
        '/dashboard',
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
