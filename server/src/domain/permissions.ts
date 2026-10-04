export const ROLES = ['admin', 'member'] as const;
export type Role = (typeof ROLES)[number];

export interface Actor {
  id: string;
  role: Role;
}

export interface ReservationFacts {
  kind: 'booking' | 'maintenance';
  userId: string | null;
}

export const policy = {
  /** Members manage their own bookings; admins manage everything. */
  changeReservation: (a: Actor, r: ReservationFacts) =>
    a.role === 'admin' || (r.kind === 'booking' && r.userId === a.id),
  manageMaintenance: (a: Actor) => a.role === 'admin',
  /** Other people's booking titles are private; the slot only shows as booked. */
  seeDetails: (a: Actor, r: ReservationFacts) => a.role === 'admin' || r.userId === a.id,
  readAllActivity: (a: Actor) => a.role === 'admin',
};
