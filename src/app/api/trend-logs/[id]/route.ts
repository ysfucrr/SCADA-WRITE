import { authOptions } from '@/lib/auth-options';
import { backendLogger } from '@/lib/logger/BackendLogger';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

// Trend log verilerini trend_log_entries'den trend_log_entries_onchange koleksiyonuna taşıyan ve eski kayıtları silen yardımcı fonksiyon
async function migrateEntriesToOnChange(db: any, entries: any[], cleanupPeriod: number): Promise<{migratedCount: number, deletedCount: number}> {
  if (!entries || entries.length === 0) {
    return { migratedCount: 0, deletedCount: 0 };
  }

  try {
    // Tüm girdiler için expiresAt alanını ekleyerek yeni veri nesnelerini oluştur
    const migratedEntries = entries.map(entry => {
      // Mevcut kaydın tüm alanlarını kopyala
      const migratedEntry = { ...entry };
      
      // expiresAt alanını hesapla - şu anki tarihten cleanupPeriod ay sonra
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + cleanupPeriod);
      migratedEntry.expiresAt = expiresAt;
      
      return migratedEntry;
    });
    
    // Aktarılacak kayıt var mı kontrol et
    if (migratedEntries.length === 0) {
      return { migratedCount: 0, deletedCount: 0 };
    }

    // Trend log ID'sini al - tüm kayıtlar aynı trend log ID'sine sahip olmalı
    const trendLogId = entries[0].trendLogId;
    
    // Toplu ekleme işlemi yap
    const insertResult = await db.collection('trend_log_entries_onchange').insertMany(migratedEntries);
    const insertedCount = insertResult.insertedCount || 0;
    
    let deletedCount = 0;
    // Eğer aktarım başarılı olduysa, eski koleksiyondaki kayıtları sil
    if (insertedCount > 0) {
      backendLogger.info(`Successfully migrated ${insertedCount} entries to trend_log_entries_onchange, deleting from original collection`, 'TrendLogAPI');
      
      // Eski koleksiyondaki ilgili trend log kayıtlarını sil
      const deleteResult = await db.collection('trend_log_entries').deleteMany({ trendLogId: trendLogId });
      deletedCount = deleteResult.deletedCount || 0;
      
      backendLogger.info(`Deleted ${deletedCount} entries from trend_log_entries collection`, 'TrendLogAPI');
    }
    
    return { migratedCount: insertedCount, deletedCount: deletedCount };
  } catch (error) {
    backendLogger.error('Error migrating entries to onChange collection', 'TrendLogAPI', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error; // Çağıran fonksiyonun hatayı ele alabilmesi için yeniden fırlat
  }
}

// Trend log verilerini trend_log_entries_onchange'den trend_log_entries koleksiyonuna taşıyan yardımcı fonksiyon
async function migrateEntriesFromOnChange(db: any, entries: any[]): Promise<{migratedCount: number, deletedCount: number}> {
  if (!entries || entries.length === 0) {
    return { migratedCount: 0, deletedCount: 0 };
  }

  try {
    // Tüm girdiler için expiresAt alanını kaldırarak yeni veri nesnelerini oluştur
    const migratedEntries = entries.map(entry => {
      // Mevcut kaydın tüm alanlarını kopyala
      const migratedEntry = { ...entry };
      
      // expiresAt alanını kaldır
      delete migratedEntry.expiresAt;
      
      return migratedEntry;
    });
    
    // Aktarılacak kayıt var mı kontrol et
    if (migratedEntries.length === 0) {
      return { migratedCount: 0, deletedCount: 0 };
    }

    // Trend log ID'sini al - tüm kayıtlar aynı trend log ID'sine sahip olmalı
    const trendLogId = entries[0].trendLogId;
    
    // Toplu ekleme işlemi yap
    const insertResult = await db.collection('trend_log_entries').insertMany(migratedEntries);
    const insertedCount = insertResult.insertedCount || 0;
    
    let deletedCount = 0;
    // Eğer aktarım başarılı olduysa, eski koleksiyondaki kayıtları sil
    if (insertedCount > 0) {
      backendLogger.info(`Successfully migrated ${insertedCount} entries from trend_log_entries_onchange to trend_log_entries, deleting from onChange collection`, 'TrendLogAPI');
      
      // Eski koleksiyondaki ilgili trend log kayıtlarını sil
      const deleteResult = await db.collection('trend_log_entries_onchange').deleteMany({ trendLogId: trendLogId });
      deletedCount = deleteResult.deletedCount || 0;
      
      backendLogger.info(`Deleted ${deletedCount} entries from trend_log_entries_onchange collection`, 'TrendLogAPI');
    }
    
    return { migratedCount: insertedCount, deletedCount: deletedCount };
  } catch (error) {
    backendLogger.error('Error migrating entries from onChange collection', 'TrendLogAPI', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error; // Çağıran fonksiyonun hatayı ele alabilmesi için yeniden fırlat
  }
}

// Trend logger servisini doğrudan import et

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get limit parameter from URL query
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin' && session.user.permissions?.trendLog === false && session.user.permissions?.billing === false) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }
    const { id } = await params;
    
    // Redis'i artık log kayıtlarını saklamak için kullanmıyoruz,
    // sadece yüzde değişim algılaması için karşılaştırma yapıyoruz.
    // Her zaman doğrudan MongoDB'den verileri okuyoruz.
    
    const { db } = await connectToDatabase();
    const trendLog = await db.collection('trendLogs').findOne({ _id: new ObjectId(id) });
    if (!trendLog) {
      return NextResponse.json({ error: 'Trend log not found' }, { status: 404 });
    }
    
    // onChange için farklı koleksiyon kullan
    const collectionName = trendLog.period === 'onChange' ?
      'trend_log_entries_onchange' : 'trend_log_entries';
    
    // Create query builder
    let query = db.collection(collectionName)
      .find({ trendLogId: new ObjectId(id) })
      .sort({ timestamp: -1 }); // Sort by newest first
    
    // Apply limit if specified
    if (limit) {
      query = query.limit(limit);
    }
    
    // Execute query
    const trendLogData = await query.toArray();
    
    // If we limited and sorted, we need to reverse to get chronological order
    if (limit) {
      trendLogData.reverse();
    }
    
    return NextResponse.json({ trendLog, trendLogData });
  } catch (error) {
    console.error('Trend log fetch failed:', error);
    return NextResponse.json({ error: 'Trend log fetch failed' }, { status: 500 });
  }
}
// Trend log güncelleme
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
   
    const { id } = await params;

    const session = await getServerSession(authOptions);

    // Yetki kontrolü
    if (!session || session.user.role !== 'admin' && session.user.permissions?.trendLog === false && session.user.permissions?.billing === false) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }
    const body = await request.json();
    const { period, endDate, isKWHCounter, interval, cleanupPeriod, percentageThreshold } = body;

    // Basic validation for fields that can be updated.
    if (!endDate || !period || (period !== 'onChange' && !interval)) {
        return NextResponse.json({ error: 'Period, end date, and interval are required' }, { status: 400 });
    }
    //end date must be in the future
    if (new Date(endDate) < new Date()) {
      return NextResponse.json({ error: 'End date must be in the future' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    // Fetch the existing log to prevent changing critical, non-editable fields.
    const existingLog = await db.collection('trendLogs').findOne({ _id: new ObjectId(id) });
    if (!existingLog) {
        return NextResponse.json({ error: 'Trend log not found' }, { status: 404 });
    }

    // Trend log'un önceki period değerini kontrol et
    const isChangingToOnChange = existingLog.period !== 'onChange' && period === 'onChange';
    const isChangingFromOnChange = existingLog.period === 'onChange' && period !== 'onChange';
    
    // Start building the update operation
    const updateOperation: { $set: any, $unset?: any } = {
      $set: {
        period,
        endDate,
        isKWHCounter,
        interval,
        updatedAt: new Date()
      }
    };

    // Conditionally add fields for 'onChange' mode
    if (period === 'onChange') {
      if (body.hasOwnProperty('percentageThreshold')) {
        updateOperation.$set.percentageThreshold = parseFloat(body.percentageThreshold);
      }
      if (body.hasOwnProperty('cleanupPeriod')) {
        updateOperation.$set.cleanupPeriod = parseInt(body.cleanupPeriod, 10);
      }
    } else {
      // If the mode is not 'onChange', remove these fields to keep data clean
      updateOperation.$unset = {
        percentageThreshold: "",
        cleanupPeriod: ""
      };
    }

    // Veritabanında güncelleme yap
    const result = await db.collection('trendLogs').updateOne(
      { _id: new ObjectId(id) },
      updateOperation
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Trend log not found' }, { status: 404 });
    }
    
    // Eğer period değeri 'onChange' olarak değiştirilmişse, eski kayıtları aktarma işlemi yap
    let dataTransferResult = null;
    if (isChangingToOnChange) {
      try {
        backendLogger.info(`Period type changed to onChange for trend log ${id}, migrating existing entries`, 'TrendLogAPI');
        
        // Mevcut kayıtları trend_log_entries koleksiyonundan al
        const existingEntries = await db.collection('trend_log_entries')
          .find({ trendLogId: new ObjectId(id) })
          .sort({ timestamp: 1 }) // Zaman sıralı al
          .toArray();
        
        if (existingEntries.length > 0) {
          const { migratedCount, deletedCount } = await migrateEntriesToOnChange(db, existingEntries, parseInt(cleanupPeriod, 10));
          dataTransferResult = {
            entriesFound: existingEntries.length,
            entriesMigrated: migratedCount,
            entriesDeleted: deletedCount
          };
        } else {
          dataTransferResult = {
            entriesFound: 0,
            entriesMigrated: 0,
            entriesDeleted: 0
          };
        }
      } catch (migrationError) {
        backendLogger.error(`Error migrating entries to onChange for trend log ${id}`, 'TrendLogAPI', {
          error: migrationError instanceof Error ? migrationError.message : String(migrationError)
        });
        dataTransferResult = {
          error: 'Migration failed but trend log updated successfully',
          details: migrationError instanceof Error ? migrationError.message : String(migrationError)
        };
      }
    }
    
    // Eğer period değeri 'onChange'den başka bir periyot tipine değiştirilmişse, ters yönlü aktarım yap
    if (isChangingFromOnChange) {
      try {
        backendLogger.info(`Period type changed from onChange to ${period} for trend log ${id}, migrating existing entries to regular collection`, 'TrendLogAPI');
        
        // Mevcut kayıtları trend_log_entries_onchange koleksiyonundan al
        const existingOnChangeEntries = await db.collection('trend_log_entries_onchange')
          .find({ trendLogId: new ObjectId(id) })
          .sort({ timestamp: 1 }) // Zaman sıralı al
          .toArray();
        
        if (existingOnChangeEntries.length > 0) {
          const { migratedCount, deletedCount } = await migrateEntriesFromOnChange(db, existingOnChangeEntries);
          dataTransferResult = {
            entriesFound: existingOnChangeEntries.length,
            entriesMigrated: migratedCount,
            entriesDeleted: deletedCount,
            direction: 'onchange_to_periodic'
          };
        } else {
          dataTransferResult = {
            entriesFound: 0,
            entriesMigrated: 0,
            entriesDeleted: 0,
            direction: 'onchange_to_periodic'
          };
        }
      } catch (migrationError) {
        backendLogger.error(`Error migrating entries from onChange to regular collection for trend log ${id}`, 'TrendLogAPI', {
          error: migrationError instanceof Error ? migrationError.message : String(migrationError)
        });
        dataTransferResult = {
          error: 'Migration failed but trend log updated successfully',
          details: migrationError instanceof Error ? migrationError.message : String(migrationError)
        };
      }
    }
    
    // The service layer will automatically handle the restart due to the database change.
    // No need to call stop/start manually anymore.

    return NextResponse.json({
      success: true,
      message: 'Trend log updated successfully',
      dataTransfer: dataTransferResult
    });
  } catch (error) {
    console.error('Trend log update failed:', error);
    return NextResponse.json({ error: 'Trend log update failed' }, { status: 500 });
  }
}

// Trend log silme
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Next.js 15'te dinamik parametreler için doğru yaklaşım - destructuring ile kullanmak
    const { id } = await params;

    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== 'admin' && session.user.permissions?.trendLog === false) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
    }
    const { db } = await connectToDatabase();

    // Trend log'yu silmesini engelle
    // Trend log bilgisini veritabanından alalım
    const trendLogToDelete = await db.collection('trendLogs').findOne({ _id: new ObjectId(id) });
    console.log('Trend log to delete:', trendLogToDelete);
    //check if any billing exist which has this trendlog in trendlogs array. this is sample billing record:

    // Trend log ID'sini trendLogs dizisindeki nesnelerin id alanında ara
    const billing = await db.collection('billings').findOne({ 'trendLogs.id': id });
    if (billing) {
      return NextResponse.json({ error: 'Cannot delete this trend log because it is used in a billing' }, { status: 400 });
    }

    // 1. Önce trend logger'ı servis üzerinde durdur
    backendLogger.info(`Stopping trend logger service for ID: ${id}`, 'TrendLogAPI');
    const stopLoggerResponse = await fetch(`http://localhost:${process.env.SERVICE_PORT}/express-api/stop-logger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id })
    });
    
    if (!stopLoggerResponse.ok) {
      console.error('Trend logger could not be stopped via Express API');
      return NextResponse.json({ error: 'Trend logger could not be stopped. Please try again.' }, { status: 500 });
    }
    
    // Servisin trend log durdurma işlemini tamamlaması için kısa bir süre bekle
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 2. Sonra trend log kaydını sil
    const result = await db.collection('trendLogs').deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Trend log not found' }, { status: 404 });
    }
    
    // 3. Periyodik raporlar ile ilgili işlemler
    
    // 3.1. Önce bu trend log'u kullanan periyodik raporları bul
    const periodicReportsWithThisLog = await db.collection('periodicReports').find({ 'trendLogs.id': id }).toArray();
    
    // 3.2. Bu raporlar içinde sadece 1 adet trend log içerenleri belirle
    const reportsToDelete: ObjectId[] = [];
    const reportsToUpdate: ObjectId[] = [];
    
    periodicReportsWithThisLog.forEach(report => {
      if (report.trendLogs && report.trendLogs.length === 1 && report.trendLogs[0].id === id) {
        // Raporda sadece bu trend log var, raporu sil
        reportsToDelete.push(report._id);
      } else {
        // Raporda başka trend loglar da var, sadece ilgili log'u kaldır
        reportsToUpdate.push(report._id);
      }
    });
    
    // 3.3. Tek trend log içeren raporları sil
    let deletedReportsCount = 0;
    if (reportsToDelete.length > 0) {
      const deleteResult = await db.collection('periodicReports').deleteMany({
        _id: { $in: reportsToDelete }
      });
      deletedReportsCount = deleteResult.deletedCount;
      backendLogger.info(`Deleted ${deletedReportsCount} periodic reports that had only this trend log.`, 'TrendLogAPI');
    }
    
    // 3.4. Birden fazla trend log içeren raporlardan sadece ilgili log'u kaldır
    let updatedReportsCount = 0;
    if (reportsToUpdate.length > 0) {
      const updateResult = await db.collection('periodicReports').updateMany(
        { _id: { $in: reportsToUpdate } },
        { $pull: { trendLogs: { id: id } } } as any
      );
      updatedReportsCount = updateResult.modifiedCount;
      backendLogger.info(`Updated ${updatedReportsCount} periodic reports by removing this trend log.`, 'TrendLogAPI');
    }
    
    backendLogger.info(`Trend log removal impact: ${deletedReportsCount} reports deleted, ${updatedReportsCount} reports updated.`, 'TrendLogAPI');

    // 4. Multi-log configurations ile ilgili işlemler
    
    // 4.1. Önce bu trend log'u içeren multi-log konfigürasyonlarını bul
    const multiLogConfigsWithThisLog = await db.collection('multi_log_configs').find({
      trendLogIds: id
    }).toArray();
    
    // 4.2. Bu konfigürasyonları güncelle veya sil
    let deletedConfigsCount = 0;
    let updatedConfigsCount = 0;
    
    for (const config of multiLogConfigsWithThisLog) {
        try {
            // Eğer konfigürasyonda sadece bu trend log varsa, konfigürasyonu sil
            if (config.trendLogIds.length === 1 && config.trendLogIds[0] === id) {
                backendLogger.info(`Deleting multi-log configuration ${config._id} because it contained only the deleted trend log.`, 'TrendLogAPI');
                const deleteResult = await db.collection('multi_log_configs').deleteOne({
                    _id: config._id
                });
                
                if (deleteResult.deletedCount > 0) {
                    deletedConfigsCount++;
                    backendLogger.info(`Successfully deleted multi-log configuration ${config._id}`, 'TrendLogAPI');
                } else {
                    backendLogger.info(`Failed to delete multi-log configuration ${config._id}`, 'TrendLogAPI');
                }
            } else {
                // Birden fazla trend log içeriyorsa, sadece silinen trend log'u kaldır
                backendLogger.info(`Updating multi-log configuration ${config._id} to remove deleted trend log.`, 'TrendLogAPI');
                
                // $pull operatörünü kullanarak doğrudan güncelleme yap
                // Bu, önce konfigürasyonu okuma ve sonra güncelleme ihtiyacını ortadan kaldırır
                // MongoDB $pull operatörünü doğru format ile kullan
                const updateResult = await db.collection('multi_log_configs').updateOne(
                    { _id: config._id },
                    { $set: { trendLogIds: config.trendLogIds.filter((logId: string) => logId !== id) } }
                );
                
                if (updateResult && updateResult.modifiedCount > 0) {
                    updatedConfigsCount++;
                    backendLogger.info(`Successfully updated multi-log configuration ${config._id}`, 'TrendLogAPI');
                } else {
                    backendLogger.info(`Failed to update multi-log configuration ${config._id}`, 'TrendLogAPI');
                }
            }
        } catch (error) {
            console.error(`Error processing multi-log config ${config._id}:`, error);
            backendLogger.error(`Error processing multi-log config ${config._id}: ${error}`, 'TrendLogAPI');
        }
    }
    
    if (deletedConfigsCount > 0 || updatedConfigsCount > 0) {
      backendLogger.info(`Multi-log configurations impact: ${deletedConfigsCount} configs deleted, ${updatedConfigsCount} configs updated.`, 'TrendLogAPI');
    }

    // 5. Son olarak normal ve onChange koleksiyonlarından tüm kayıtları sil
    const normalEntries = await db.collection('trend_log_entries').deleteMany({ trendLogId: new ObjectId(id) });
    const onChangeEntries = await db.collection('trend_log_entries_onchange').deleteMany({ trendLogId: new ObjectId(id) });
    
    const totalDeleted = (normalEntries.deletedCount || 0) + (onChangeEntries.deletedCount || 0);
    backendLogger.info(`${totalDeleted} trend log entries deleted for trend log ${id}.`, 'TrendLogAPI');
    
    return NextResponse.json({
      success: true,
      message: 'Trend log and its entries deleted successfully',
      impactSummary: {
        entriesDeleted: totalDeleted,
        periodicReports: {
          deleted: deletedReportsCount,
          updated: updatedReportsCount
        },
        multiLogConfigs: {
          deleted: deletedConfigsCount,
          updated: updatedConfigsCount
        }
      }
    });
  } catch (error) {
    console.error('Trend log deletion failed:', error);
    return NextResponse.json({ error: 'Trend log deletion failed' }, { status: 500 });
  }
}

