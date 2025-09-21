import { NextResponse } from "next/server";
import os from 'os';
export async function GET() {
    const interfaces = os.networkInterfaces();
    // Prioritize Ethernet over Wi-Fi, then other connection types.
    const priorityInterfaces = [
        /^eth/i,      // Ethernet (eth0, eth1, etc.)
        /^en/i,       // Ethernet (en0, enp2s0, etc.) - common on macOS and some Linux
        /^wlan/i,     // Wireless LAN (wlan0, etc.)
        /^wi-fi/i,    // Wi-Fi
    ];
    
    let fallbackIp: string | null = null;

    // Search in prioritized order
    for (const priorityRegex of priorityInterfaces) {
        for (const interfaceName in interfaces) {
            if (priorityRegex.test(interfaceName)) {
                const interfaceInfo = interfaces[interfaceName];
                for (const info of interfaceInfo!) {
                    if (info.family === 'IPv4' && !info.internal) {
                        // Found a high-priority IP, return it immediately.
                        return NextResponse.json({ success: true, ip: info.address });
                    }
                }
            }
        }
    }

    // If no priority IP was found, perform a general search, avoiding virtual interfaces.
    for (const interfaceName in interfaces) {
        if (/virtual|vpn|docker|loopback|teredo/i.test(interfaceName)) {
            continue; // Skip known virtual/irrelevant interfaces
        }
        
        const interfaceInfo = interfaces[interfaceName];
        for (const info of interfaceInfo!) {
            if (info.family === 'IPv4' && !info.internal) {
                 // Prefer non-CGNAT addresses if possible
                if (!info.address.startsWith('100.')) {
                     return NextResponse.json({ success: true, ip: info.address });
                }
                // Store the first valid IP as a fallback
                if (!fallbackIp) {
                    fallbackIp = info.address;
                }
            }
        }
    }

    // Return the best found IP or the default.
    return NextResponse.json({ success: true, ip: fallbackIp || '127.0.0.1' });
}
