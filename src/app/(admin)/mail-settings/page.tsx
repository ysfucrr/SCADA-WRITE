"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { Eye, EyeOff, Mail } from 'lucide-react';
import axios from 'axios';
import Swal from 'sweetalert2';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import { MailSettings } from '@/types/mail-settings';
import { Button, OutlineButton } from '@/components/ui/button/CustomButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Checkbox from '@/components/form/input/Checkbox';

const MailSettingsPage: React.FC = () => {
    const [settings, setSettings] = useState<Partial<MailSettings>>({
        host: '',
        port: 587,
        secure: true,
        auth: { user: '', pass: '' },
        from: '',
        to: '',
    });
    const [loading, setLoading] = useState(true);
    const [showPassword, setShowPassword] = useState(false);

    const fetchSettings = useCallback(async () => {
        try {
            const response = await axios.get<MailSettings>('/api/mail-settings');
            if (response.data && Object.keys(response.data).length > 0) {
                setSettings({ ...response.data, auth: response.data.auth || {user: '', pass: ''} });
            }
        } catch (error) {
            console.error('Failed to fetch mail settings:', error);
            Swal.fire('Error', 'Failed to fetch mail settings.', 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        
        if (name.startsWith('auth.')) {
            const authField = name.split('.')[1] as keyof MailSettings['auth'];
            setSettings(prev => ({
                ...prev,
                auth: { ...(prev.auth || {user: '', pass: ''}), [authField]: value }
            }));
        } else {
             // This part is for a generic checkbox handler, which we are not using for 'secure' anymore.
             // It can be removed or kept for future checkboxes.
            setSettings(prev => ({
                ...prev,
                [name]: type === 'checkbox' ? checked : value,
            }));
        }
    };
    
    const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSettings(prev => ({
            ...prev,
            port: parseInt(e.target.value, 10) || 0,
        }));
    };

    const handleCheckboxChange = (checked: boolean) => {
        setSettings(prev => ({
            ...prev,
            secure: checked,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const settingsToSave = { ...settings };
        delete settingsToSave._id;

        try {
            await axios.post('/api/mail-settings', settingsToSave);
            Swal.fire('Success', 'Mail settings saved successfully!', 'success');
            fetchSettings(); 
        } catch (error) {
            console.error('Failed to save mail settings:', error);
            Swal.fire('Error', 'Failed to save mail settings.', 'error');
        }
    };

    const handleSendTestEmail = async () => {
        try {
            const response = await axios.post('/api/mail-settings/test');
            Swal.fire('Success', response.data.message, 'success');
        } catch (error) {
            console.error('Failed to send test email:', error);
            let errorMessage = 'An unknown error occurred.';
            if (axios.isAxiosError(error) && error.response) {
                errorMessage = error.response.data?.error || errorMessage;
            }
            Swal.fire('Error', `Failed to send test email: ${errorMessage}`, 'error');
        }
    };

    if (loading) {
        return <div className="p-4 text-center">Loading settings...</div>;
    }

    return (
        <>
            <PageBreadcrumb pageTitle="Mail Settings" />
            <div className="rounded-lg border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
                <div className="border-b border-stroke px-6.5 py-4 dark:border-strokedark">
                    <h3 className="font-medium text-black dark:text-white">
                        SMTP Configuration
                    </h3>
                </div>
                <form onSubmit={handleSubmit} className="p-6.5">
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        <div className="flex flex-col gap-1">
                            <Label htmlFor="host">SMTP Host</Label>
                            <Input id="host" name="host" value={settings.host || ''} onChange={handleChange} placeholder="smtp.example.com" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <Label htmlFor="port">SMTP Port</Label>
                             <Input id="port" type="number" name="port" value={settings.port || ''} onChange={handlePortChange} />
                        </div>
                        <div className="flex flex-col gap-1">
                            <Label htmlFor="auth.user">SMTP User</Label>
                            <Input id="auth.user" name="auth.user" value={settings.auth?.user || ''} onChange={handleChange} placeholder="user@example.com" />
                        </div>
                        <div className="flex flex-col gap-1 relative">
                           <Label htmlFor="auth.pass">SMTP Password</Label>
                           <Input id="auth.pass" type={showPassword ? "text" : "password"} name="auth.pass" value={settings.auth?.pass || ''} onChange={handleChange} placeholder="******" />
                           <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" style={{top: '28px'}}>
                               {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                           </button>
                        </div>
                         <div className="flex flex-col gap-1">
                            <Label htmlFor="from">Sender Email (From)</Label>
                            <Input id="from" type="email" name="from" value={settings.from || ''} onChange={handleChange} placeholder="sender@example.com" />
                        </div>
                         <div className="flex flex-col gap-1">
                            <Label htmlFor="to">Recipient Email (To)</Label>
                            <Input id="to" type="text" name="to" value={settings.to || ''} onChange={handleChange} placeholder="a@example.com, b@example.com" />
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                For multiple recipients, enter email addresses separated by commas (,)
                            </p>
                        </div>
                         <div className="flex items-center gap-2 md:col-span-2">
                            <Checkbox id="secure" checked={!!settings.secure} onChange={handleCheckboxChange} />
                            <Label htmlFor="secure">Use SSL/TLS (Secure)</Label>
                        </div>
                    </div>
                     <div className="mt-6 flex justify-end gap-4">
                        <OutlineButton type="button" onClick={handleSendTestEmail} leftIcon={<Mail size={16}/>}>
                            Send Test Mail
                        </OutlineButton>
                        <Button type="submit" variant="primary">
                            Save Settings
                        </Button>
                    </div>
                </form>
            </div>
        </>
    );
};

export default MailSettingsPage;