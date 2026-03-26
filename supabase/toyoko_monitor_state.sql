create table if not exists public.toyoko_monitor_state (
  hotel_id text primary key,
  last_status text not null check (last_status in ('有房', '无房', '未知')),
  updated_at timestamptz not null default now()
);

comment on table public.toyoko_monitor_state is
  'Toyoko 监控上次状态，用于判定 无房->有房 才通知。';
