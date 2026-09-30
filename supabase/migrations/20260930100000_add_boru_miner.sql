-- Catalog-only addition: existing purchase/ownership/assignment authority applies.
-- One purchase creates one instance, assignable to one unlocked Miner floor.
insert into public.cat_blueprints
  (asset_id, display_name, role_id, rarity_tier, price_exact, power, speed, capacity, efficiency)
values
  ('miner:SSR:boru:idle', 'Boru', 'miner', 'SSR', 42000, 96, 68, 95, 90)
on conflict (asset_id) do nothing;
