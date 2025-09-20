import { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | null = null;

export const setServerSocket = (server: SocketIOServer) => {
  io = server;
};

export const getServerSocket = (): SocketIOServer | null => {
  return io;
};