import { useEffect, useState } from "react";
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.min.css";
import { Label } from "../ui/label";
import { CalenderIcon } from '../../icons';

type PropsType = {
  id: string;
  mode?: "single" | "multiple" | "range" | "time";
  onChange?: any;
  defaultDate?: any;
  label?: string;
  dateFormat?: string;
  placeholder?: string;
  enableTime?: boolean;
  minDate?: any;
  disablePast?: boolean;
};

export default function DatePicker({
  id,
  mode,
  onChange,
  label,
  defaultDate,
  dateFormat,
  placeholder,
  enableTime,
  minDate,
  disablePast,
}: PropsType) {
  const [flatPickrInstance, setFlatPickrInstance] = useState<any>(null);
  useEffect(() => {
    // Flatpickr'ı doğrudan ID seçici ile kullanıyoruz
    // @ts-ignore - TypeScript hatalarını görmezden geliyoruz
    const flatPickrInstance = flatpickr(`#${id}`, {
      mode: mode || "single",
      static: false,
      monthSelectorType: "static",
      dateFormat: dateFormat || (enableTime ? "Y-m-d H:i" : "Y-m-d"),
      defaultDate,
      onChange,
      // Tarih ve saat seçimi
      enableTime: enableTime || false,
      time_24hr: true,
      // Geçmiş tarihleri engelleme
      minDate: disablePast ? new Date() : minDate,
      // Pozisyon sorunlarını çözmek için
      appendTo: document.body,
      disableMobile: true,
      // Stillemek için
      onOpen: function () {
        const calendar = document.querySelector('.flatpickr-calendar') as HTMLElement;
        if (calendar) {
          calendar.style.zIndex = '99999';
          calendar.style.position = 'absolute';
        }
      }
    });
    setFlatPickrInstance(flatPickrInstance);
    // @ts-ignore - TypeScript hatalarını görmezden geliyoruz
    return () => {
      if (flatPickrInstance) {
        // Eğer dizi ise
        if (Array.isArray(flatPickrInstance)) {
          // Dizideki her instance'ı temizle
          flatPickrInstance.forEach(instance => instance.destroy());
        } else {
          // Tek bir instance ise
          flatPickrInstance.destroy();
        }
      }
    };
  }, [mode, onChange, id, defaultDate, enableTime, minDate, disablePast, dateFormat]);

  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}

      <div className="relative">
        <input
          id={id}
          placeholder={placeholder}
          className="h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3  dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30  bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 focus:ring-brand-500/20 dark:border-gray-700  dark:focus:border-brand-800"
        />

        <span className="absolute text-gray-500 -translate-y-1/2 pointer-events-none right-3 top-1/2 dark:text-gray-400">
          <CalenderIcon className="size-6" />
        </span>
      </div>
    </div>
  );
}
