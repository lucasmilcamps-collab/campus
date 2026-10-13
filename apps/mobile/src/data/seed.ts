// Demo races for the fake data layer. Fictional events (made-up names, real
// cities) so the directory has something to show before our own race data
// source exists. Nothing here comes from any other app's directory.

import type { Race } from './api';

export const DEMO_RACES: Race[] = [
  { id: 'r1', name: 'Semi de la Citadelle', date: '2027-03-21', city: 'Namur', distanceM: 21_097, elevationGainM: 140, discipline: 'road', membersCount: 214 },
  { id: 'r2', name: 'Les Foulées du Canal', date: '2026-12-06', city: 'Charleroi', distanceM: 10_000, elevationGainM: 20, discipline: 'road', membersCount: 87 },
  { id: 'r3', name: 'Marathon des Deux Rives', date: '2027-04-25', city: 'Liège', distanceM: 42_195, elevationGainM: 230, discipline: 'road', membersCount: 356 },
  { id: 'r4', name: 'Trail des Trois Collines', date: '2027-05-16', city: 'Spa', distanceM: 27_000, elevationGainM: 950, discipline: 'trail', membersCount: 63 },
  { id: 'r5', name: '10 km des Quais', date: '2027-02-14', city: 'Lille', distanceM: 10_000, elevationGainM: 15, discipline: 'road', membersCount: 128 },
  { id: 'r6', name: 'Corrida de la Saint-Sylvestre du Parc', date: '2026-12-31', city: 'Bruxelles', distanceM: 5_000, elevationGainM: 30, discipline: 'road', membersCount: 41 },
  { id: 'r7', name: 'Semi des Vignes et des Coteaux de la Vallée', date: '2027-06-13', city: 'Reims', distanceM: 21_097, elevationGainM: 310, discipline: 'road', membersCount: 52 },
  { id: 'r8', name: 'Ultra des Crêtes', date: '2027-08-28', city: 'Annecy', distanceM: 58_000, elevationGainM: 3_400, discipline: 'trail', membersCount: 19 },
];
