import { ObjectId } from 'mongodb';

export interface MailSettings {
  _id?: ObjectId;
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
  to: string;
}