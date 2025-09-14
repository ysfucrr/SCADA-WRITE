# Lisans Sunucusu (.exe) Derleme Talimatları

Bu belge, Go dilinde yazılmış lisans sunucusunun nasıl derlenip .exe dosyası haline getirileceğini açıklar.

## Gereksinimler

- Go programlama dili (en az 1.16 sürümü)
- Windows işletim sistemi

## Go Kurulumu

Eğer Go kurulu değilse, aşağıdaki adımları izleyin:

1. [Go İndirme Sayfası](https://golang.org/dl/)ndan Windows için en son Go sürümünü indirin.
2. İndirilen kurulum dosyasını çalıştırın ve ekrandaki talimatları izleyin.
3. Kurulum tamamlandıktan sonra, Go'nun doğru şekilde kurulduğunu doğrulamak için bir komut istemcisi açın ve aşağıdaki komutu çalıştırın:

```
go version
```

Bu komut, yüklenen Go sürümünü göstermelidir.

## Derleme Adımları

1. Komut istemcisini açın.
2. `license-server` dizinine gidin:

```
cd [projenin_konumu]/license-server
```

3. Go modülünü başlatın (ilk kez derliyorsanız):

```
go mod init license-server
```

4. Uygulamayı derleyin:

```
go build -o license-server.exe main.go
```

5. Derleme başarılı olursa, aynı dizinde `license-server.exe` adlı bir dosya oluşturulacaktır.

## Windows Servisi Olarak Yükleme (İsteğe Bağlı)

Lisans sunucusunu Windows'ta otomatik olarak başlatılacak bir servis olarak yapılandırmak için NSSM (Non-Sucking Service Manager) gibi araçları kullanabilirsiniz.

## Notlar

- `main.go` dosyasındaki gizli anahtar, exe dosyası içine gömülü olacaktır. Bu, güvenlik açısından kaynak kodunun açık olmasından daha güvenlidir.
- Obfuscation için ek araçlar kullanabilirsiniz (ör. [garble](https://github.com/burrowers/garble)).
- Windows güvenlik duvarı ayarlarının 3002 portunu izin verdiğinden emin olun.