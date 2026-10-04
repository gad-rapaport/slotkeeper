export type Role = 'admin' | 'member';
export type Kind = 'room' | 'desk' | 'equipment';
export type SlotState = 'free' | 'booked' | 'mine' | 'maintenance' | 'past';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export interface Site {
  id: string;
  name: string;
  timezone: string;
  resources: number;
}

export interface Resource {
  id: string;
  siteId: string;
  siteName: string;
  timezone: string;
  kind: Kind;
  name: string;
  description: string;
  capacity: number | null;
  slotMinutes: number;
  minMinutes: number;
  maxMinutes: number;
}

export interface Reservation {
  id: string;
  resourceId: string;
  resourceName: string;
  siteName: string;
  timezone: string;
  kind: 'booking' | 'maintenance';
  status: 'active' | 'cancelled';
  start: string;
  end: string;
  localDate: string;
  localStart: string;
  localEnd: string;
  title: string | null;
  mine: boolean;
  userName: string | null;
  version: number;
}

export interface Slot {
  start: string;
  end: string;
  localStart: string;
  state: SlotState;
  reservationId: string | null;
}

export interface Day {
  date: string;
  weekday: number;
  open: boolean;
  opens: string | null;
  closes: string | null;
  dayLengthHours: number;
  slots: Slot[];
  reservations: Reservation[];
}

export interface Availability {
  resource: Resource;
  today: string;
  days: Day[];
}

export interface ActivityEntry {
  id: number;
  actorName: string | null;
  reservationId: string | null;
  resourceName: string | null;
  action: string;
  summary: string;
  createdAt: string;
}
