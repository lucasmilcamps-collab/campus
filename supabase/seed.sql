-- Demo races: fictional events (made-up names, real cities). Idempotent.
-- Real race data comes from our own source later; nothing here is copied from another directory.
insert into public.races (name, race_date, city, country, distance_m, elevation_gain_m, discipline, status) values
  ('Semi de la Citadelle', '2027-03-21', 'Namur', 'BE', 21097, 140, 'road', 'published'),
  ('Les Foulées du Canal', '2026-12-06', 'Charleroi', 'BE', 10000, 20, 'road', 'published'),
  ('Marathon des Deux Rives', '2027-04-25', 'Liège', 'BE', 42195, 230, 'road', 'published'),
  ('Trail des Trois Collines', '2027-05-16', 'Spa', 'BE', 27000, 950, 'trail', 'published'),
  ('10 km des Quais', '2027-02-14', 'Lille', 'FR', 10000, 15, 'road', 'published'),
  ('Corrida de la Saint-Sylvestre du Parc', '2026-12-31', 'Bruxelles', 'BE', 5000, 30, 'road', 'published'),
  ('Semi des Vignes et des Coteaux de la Vallée', '2027-06-13', 'Reims', 'FR', 21097, 310, 'road', 'published'),
  ('Ultra des Crêtes', '2027-08-28', 'Annecy', 'FR', 58000, 3400, 'trail', 'published')
on conflict do nothing;
