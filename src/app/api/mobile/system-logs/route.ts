import { NextRequest, NextResponse } from 'next/server';

// Mobile app için system logs endpoint'i
// Service process'indeki (port 3001) BackendLogger'dan logları alır
export async function GET(request: NextRequest) {
  try {
    // URL parametrelerini al (filtreleme için)
    const url = new URL(request.url);
    const levelFilter = url.searchParams.get('level');
    const sourceFilter = url.searchParams.get('source');
    const searchFilter = url.searchParams.get('search');
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 1000; // Default 1000 log

    // Service process'indeki (port 3001) BackendLogger'dan logları almak için HTTP isteği yap
    const servicePort = process.env.SERVICE_PORT || '3001';
    const queryParams = new URLSearchParams();
    if (levelFilter) queryParams.append('level', levelFilter);
    if (sourceFilter) queryParams.append('source', sourceFilter);
    if (searchFilter) queryParams.append('search', searchFilter);
    if (limitParam) queryParams.append('limit', limitParam);
    
    const serviceUrl = `http://localhost:${servicePort}/express-api/system-logs${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    
    console.log(`[Mobile System Logs] Fetching logs from service: ${serviceUrl}`);
    
    // Timeout kontrolü için AbortController kullan
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(serviceUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Service API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    console.log(`[Mobile System Logs] Service returned ${data.returned} logs (${data.filtered} filtered from ${data.total} total)`);

    return NextResponse.json(data);
    
  } catch (error: any) {
    console.error('Mobile system logs could not be fetched:', error);
    
    // Timeout veya bağlantı hatası durumunda boş sonuç döndür
    if (error.name === 'AbortError' || error.code === 'ECONNREFUSED') {
      console.warn('[Mobile System Logs] Service unavailable, returning empty logs');
      return NextResponse.json({ 
        error: 'Service unavailable',
        success: false,
        logs: [],
        total: 0,
        filtered: 0,
        returned: 0
      }, { status: 503 });
    }
    
    return NextResponse.json({ 
      error: 'System logs could not be fetched',
      success: false,
      logs: [],
      total: 0,
      filtered: 0,
      returned: 0
    }, { status: 500 });
  }
}

