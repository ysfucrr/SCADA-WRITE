package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
)

// Gizli anahtarımız - bu anahtar .exe içinde gömülü olacak ve kolay erişilemeyecek
const secretKey = "c78c89b5c28ddc4aa43b7192e2f7d7c110d3f626584347bead4ad9a68f3b689e"

// LicenseData lisans verilerini temsil eder
type LicenseData struct {
	MachineID  string `json:"machineId"`
	MaxDevices int    `json:"maxDevices"`
	Signature  string `json:"signature,omitempty"`
}

// Response API yanıtları için standart yapı
type Response struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// ValidateResponse doğrulama yanıtları için yapı
type ValidateResponse struct {
	Valid         bool `json:"valid"`
	MaxDevices    int  `json:"maxDevices,omitempty"`
	UsedAnalyzers int  `json:"usedAnalyzers,omitempty"`
}

// Ana çalışma dizinimizi bulalım
func getWorkingDir() string {
	exePath, err := os.Executable()
	if err != nil {
		log.Printf("Executable path bulunamadı, current directory kullanılıyor: %v", err)
		return "."
	}
	return filepath.Dir(exePath)
}

// Lisans dosyası yolunu oluştur
func getLicensePath() string {
	return filepath.Join(getWorkingDir(), "license.json")
}

// HMAC-SHA256 imzası oluştur
func createSignature(data LicenseData) string {
	// MaxDevices ve MachineID ile bir imza oluştur
	jsonData, _ := json.Marshal(map[string]interface{}{
		"machineId":  data.MachineID,
		"maxDevices": data.MaxDevices,
	})

	h := hmac.New(sha256.New, []byte(secretKey))
	h.Write(jsonData)
	return hex.EncodeToString(h.Sum(nil))
}

// Lisans doğrulama işlemi
func validateLicense(licenseData LicenseData, actualMachineID string) (bool, string) {
	// İmzayı doğrula
	expectedSignature := createSignature(licenseData)
	if expectedSignature != licenseData.Signature {
		return false, "Invalid signature"
	}

	// Makine ID'sini doğrula
	if licenseData.MachineID != actualMachineID {
		return false, "Machine ID mismatch"
	}

	return true, ""
}

func main() {
	// Makine ID endpoint'i
	http.HandleFunc("/machine-id", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Bu bölümde, gerçek makine ID'sini almak için node-machine-id benzeri bir işlev kullanılmalı
		// Şimdilik, sadece Next.js'den gelen istekleri kabul ediyoruz ve ID'yi Next.js'in göndermesini bekliyoruz
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{
			"machineId": r.Header.Get("X-Machine-ID"),
		})
	})

	// Lisans aktivasyon endpoint'i
	http.HandleFunc("/activate", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Makine ID'sini al
		actualMachineID := r.Header.Get("X-Machine-ID")
		if actualMachineID == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(Response{Success: false, Error: "Missing machine ID"})
			return
		}

		// Multipart form'dan dosyayı al
		err := r.ParseMultipartForm(10 << 20) // 10 MB max
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(Response{Success: false, Error: "Invalid form data"})
			return
		}

		file, _, err := r.FormFile("file")
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(Response{Success: false, Error: "Missing license file"})
			return
		}
		defer file.Close()

		// Dosya içeriğini oku
		fileContent, err := io.ReadAll(file)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(Response{Success: false, Error: "Error reading file"})
			return
		}

		// JSON'ı parse et
		var license LicenseData
		if err := json.Unmarshal(fileContent, &license); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(Response{Success: false, Error: "Invalid license file format"})
			return
		}

		// Lisansı doğrula
		valid, errMsg := validateLicense(license, actualMachineID)
		if !valid {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(Response{Success: false, Error: errMsg})
			return
		}

		// Lisansı kaydet
		licensePath := getLicensePath()
		err = os.WriteFile(licensePath, fileContent, 0644)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(Response{Success: false, Error: "Error saving license"})
			return
		}

		// Başarılı yanıt döndür
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(Response{Success: true})
	})

	// Lisans doğrulama endpoint'i
	http.HandleFunc("/validate", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Makine ID'sini al
		machineID := r.Header.Get("X-Machine-ID")
		if machineID == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK) // Hata durumunda bile 200 dönüyoruz (orijinal API gibi)
			json.NewEncoder(w).Encode(ValidateResponse{Valid: false})
			return
		}

		// Lisans dosyasını kontrol et
		licensePath := getLicensePath()
		if _, err := os.Stat(licensePath); os.IsNotExist(err) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(ValidateResponse{Valid: false})
			return
		}

		// Lisans dosyasını oku
		fileContent, err := os.ReadFile(licensePath)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(ValidateResponse{Valid: false})
			return
		}

		// JSON'ı parse et
		var license LicenseData
		if err := json.Unmarshal(fileContent, &license); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(ValidateResponse{Valid: false})
			return
		}

		// Lisansı doğrula
		valid, _ := validateLicense(license, machineID)
		if !valid {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(ValidateResponse{Valid: false})
			return
		}

		// Kullanılan analyzer sayısını al (bu bilgiyi Next.js'den alacağız)
		usedAnalyzers, _ := strconv.Atoi(r.Header.Get("X-Used-Analyzers"))

		// Başarılı yanıt döndür
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(ValidateResponse{
			Valid:         true,
			MaxDevices:    license.MaxDevices,
			UsedAnalyzers: usedAnalyzers,
		})
	})

	// CORS header'larını ekle
	corsMiddleware := func(handler http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Machine-ID, X-Used-Analyzers")
			
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusOK)
				return
			}
			
			handler.ServeHTTP(w, r)
		})
	}

	// Sunucuyu başlat
	port := 3002
	fmt.Printf("License server başlatılıyor: http://localhost:%d\n", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), corsMiddleware(http.DefaultServeMux)))
}