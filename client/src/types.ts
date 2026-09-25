// client/src/types.ts

export interface User {
  id: number;
  username: string;
  email: string;
  avatar_url: string;
}

export interface Message {
  id?: number;
  sender_id: number;
  sender_name: string;
  avatar_url: string;
  room_id: string;
  message: string;
  created_at?: string;
}