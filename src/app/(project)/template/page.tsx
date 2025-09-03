"use client"
import { Button, OutlineButton, GhostButton } from "@/components/ui/button/CustomButton";
import { Heading1, Heading2, Heading3, Paragraph } from "@/components/ui/typography";
import { 
  showSuccessAlert, 
  showErrorAlert, 
  showWarningAlert, 
  showConfirmAlert, 
  showInputAlert, 
  showToast 
} from "@/components/ui/alert";
// @ts-ignore
import { EditButton, DeleteButton, SaveButton } from "@/components/ui/action-buttons";

export default function Home() {
  const handleSuccessAlert = () => {
    showSuccessAlert("Başarılı", "Bu bir başarı mesajıdır!");
  };

  const handleErrorAlert = () => {
    showErrorAlert("Hata", "Bu bir hata mesajıdır!");
  };

  const handleWarningAlert = () => {
    showWarningAlert("Uyarı", "Bu bir uyarı mesajıdır!");
  };
  
  const handleConfirmAlert = () => {
    showConfirmAlert(
      'Onay İşlemi', 
      'Bu işlemi gerçekleştirmek istediğinize emin misiniz?',
      'Onayla',
      'Vazgeç'
    ).then((result) => {
      if (result.isConfirmed) {
        showToast('İşlem onaylandı!', 'success');
      }
    });
  };

  const handleInputAlert = () => {
    showInputAlert(
      'Bilgi Girişi',
      'Adınızı girin'
    ).then((result) => {
      if (result.isConfirmed && result.value) {
        showToast(`Merhaba, ${result.value}!`, 'success');
      }
    });
  };

  const handleToast = (type: 'success' | 'error' | 'warning' | 'info') => {
    const messages = {
      success: 'İşlem başarıyla tamamlandı!',
      error: 'Bir hata oluştu!',
      warning: 'Dikkat! Bu bir uyarı mesajıdır.',
      info: 'Bilgilendirme mesajı.'
    };
    
    showToast(messages[type], type);
  };

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <Heading1>RTU Dashboard</Heading1>
        <Paragraph>
          Welcome to the RTU Dashboard. This is a modern admin panel built with Next.js and Tailwind CSS.
          It features a responsive design and dark mode support.
        </Paragraph>
      </section>

      <section className="space-y-4">
        <Heading2>Typography</Heading2>
        <div className="space-y-4">
          <Heading1>Heading 1</Heading1>
          <Heading2>Heading 2</Heading2>
          <Heading3>Heading 3</Heading3>
          <Paragraph>
            This is a paragraph with some text. The quick brown fox jumps over the lazy dog.
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
          </Paragraph>
        </div>
      </section>

      <section className="space-y-4">
        <Heading2>Buttons</Heading2>
        <div className="space-y-4">
          <div className="space-y-2">
            <Heading3>Standard Buttons</Heading3>
            <div className="flex flex-wrap gap-4">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="success">Success</Button>
              <Button variant="warning">Warning</Button>
              <Button variant="error">Error</Button>
            </div>
          </div>

          <div className="space-y-2">
            <Heading3>Outline Buttons</Heading3>
            <div className="flex flex-wrap gap-4">
              <OutlineButton variant="primary">Primary</OutlineButton>
              <OutlineButton variant="secondary">Secondary</OutlineButton>
              <OutlineButton variant="success">Success</OutlineButton>
              <OutlineButton variant="warning">Warning</OutlineButton>
              <OutlineButton variant="error">Error</OutlineButton>
            </div>
          </div>

          <div className="space-y-2">
            <Heading3>Ghost Buttons</Heading3>
            <div className="flex flex-wrap gap-4">
              <GhostButton variant="primary">Primary</GhostButton>
              <GhostButton variant="secondary">Secondary</GhostButton>
              <GhostButton variant="success">Success</GhostButton>
              <GhostButton variant="warning">Warning</GhostButton>
              <GhostButton variant="error">Error</GhostButton>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <Heading2>Alerts</Heading2>
        <div className="flex flex-wrap gap-4">
          <Button onClick={handleSuccessAlert}>Başarı Alert</Button>
          <Button variant="warning" onClick={handleWarningAlert}>Uyarı Alert</Button>
          <Button variant="error" onClick={handleErrorAlert}>Hata Alert</Button>
        </div>
        
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Confirm Alert */}
          <div className="p-4 border border-border/40 rounded-lg">
            <h3 className="font-medium mb-3">Onay Alert'i</h3>
            <Button 
              onClick={handleConfirmAlert}
              className="w-full"
            >
              Onay İste
            </Button>
          </div>
          
          {/* Input Alert */}
          <div className="p-4 border border-border/40 rounded-lg">
            <h3 className="font-medium mb-3">Input Alert'i</h3>
            <Button 
              onClick={handleInputAlert}
              className="w-full"
            >
              Bilgi İste
            </Button>
          </div>
        </div>
      </section>
      
      <section className="space-y-4">
        <Heading2>Toast Mesajları</Heading2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 border border-border/40 rounded-lg">
            <h3 className="font-medium mb-3">Başarı Toast</h3>
            <Button 
              onClick={() => handleToast('success')}
              variant="success"
              className="w-full"
            >
              Başarı Toast
            </Button>
          </div>
          
          <div className="p-4 border border-border/40 rounded-lg">
            <h3 className="font-medium mb-3">Hata Toast</h3>
            <Button 
              onClick={() => handleToast('error')}
              variant="error"
              className="w-full"
            >
              Hata Toast
            </Button>
          </div>
          
          <div className="p-4 border border-border/40 rounded-lg">
            <h3 className="font-medium mb-3">Uyarı Toast</h3>
            <Button 
              onClick={() => handleToast('warning')}
              variant="warning"
              className="w-full"
            >
              Uyarı Toast
            </Button>
          </div>
          
          <div className="p-4 border border-border/40 rounded-lg">
            <h3 className="font-medium mb-3">Bilgi Toast</h3>
            <Button 
              onClick={() => handleToast('info')}
              variant="primary"
              className="w-full"
            >
              Bilgi Toast
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <Heading2>İkon Butonları</Heading2>
        <div className="space-y-4">
          <div className="space-y-2">
            <Heading3>Standart Boyut</Heading3>
            <div className="flex flex-wrap gap-4 items-center">
              <EditButton onClick={() => showSuccessAlert("Düzenleme", "Düzenleme işlemi başlatıldı.")} />
              <DeleteButton onClick={() => showErrorAlert("Silme", "Silmek istediğinize emin misiniz?")} />
              <SaveButton onClick={() => showSuccessAlert("Kaydetme", "Başarıyla kaydedildi!")} />
            </div>
          </div>
          
          <div className="space-y-2">
            <Heading3>Küçük Boyut</Heading3>
            <div className="flex flex-wrap gap-4 items-center">
              <EditButton size="sm" />
              <DeleteButton size="sm" />
              <SaveButton size="sm" />
            </div>
          </div>
          
          <div className="space-y-2">
            <Heading3>Büyük Boyut</Heading3>
            <div className="flex flex-wrap gap-4 items-center">
              <EditButton size="lg" />
              <DeleteButton size="lg" />
              <SaveButton size="lg" />
            </div>
          </div>
          
          <div className="space-y-2">
            <Heading3>Devre Dışı Butonlar</Heading3>
            <div className="flex flex-wrap gap-4 items-center">
              <EditButton disabled />
              <DeleteButton disabled />
              <SaveButton disabled />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
