-- Modulo de Pagos Masivos BNCR: catalogo de beneficiarios (empleados y
-- proveedores), lotes exportados y su desglose por rubro/factura.
--
-- Todas las tablas llevan el prefijo bncr_ para convivir sin colisiones con
-- las tablas de inventario que ya existen en el proyecto de Supabase.
-- Escrita de forma defensiva (if not exists) para poder correrse de nuevo.

create table if not exists public.bncr_empleados (
  id uuid primary key default gen_random_uuid(),
  cedula text not null,
  nombre text not null,
  cuenta_cliente text not null,
  puesto text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.bncr_proveedores (
  id uuid primary key default gen_random_uuid(),
  cedula text not null,
  nombre text not null,
  cuenta_cliente text not null,
  correo text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Un lote es un archivo .txt/.env generado y descargado para subir al BNCR.
create sequence if not exists public.bncr_lotes_consecutivo_seq;

create table if not exists public.bncr_lotes (
  id uuid primary key default gen_random_uuid(),
  consecutivo bigint not null default nextval('public.bncr_lotes_consecutivo_seq'),
  tipo text not null,
  descripcion text not null,
  cuenta_debito text not null,
  cedula_empresa text not null,
  nombre_empresa text not null,
  moneda text not null default 'CRC',
  fecha_aplicacion date not null,
  -- Montos en centimos (enteros) para no arrastrar errores de punto flotante:
  -- es la misma unidad que exige el archivo posicional del banco.
  total_centimos bigint not null,
  cantidad_detalles integer not null,
  nombre_archivo text not null,
  contenido text not null,
  creado_por text,
  created_at timestamptz not null default now()
);

create table if not exists public.bncr_detalles_pago (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.bncr_lotes(id) on delete cascade,
  beneficiario_tipo text not null,
  empleado_id uuid references public.bncr_empleados(id),
  proveedor_id uuid references public.bncr_proveedores(id),
  nombre_beneficiario text not null,
  cedula text not null,
  cuenta_cliente text not null,
  concepto text not null,
  monto_centimos bigint not null,
  linea integer not null,
  created_at timestamptz not null default now()
);

-- Desglose 1:N del deposito acumulado de cada beneficiario: rubros de planilla
-- (salario base, lavado de carro, descarga de maiz...) o facturas de proveedor.
create table if not exists public.bncr_rubros_pago (
  id uuid primary key default gen_random_uuid(),
  detalle_id uuid not null references public.bncr_detalles_pago(id) on delete cascade,
  descripcion text not null,
  numero_factura text,
  monto_centimos bigint not null,
  created_at timestamptz not null default now()
);

do $$
begin
  alter table public.bncr_empleados add constraint bncr_empleados_cedula_key unique (cedula);
exception when duplicate_table or duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.bncr_proveedores add constraint bncr_proveedores_cedula_key unique (cedula);
exception when duplicate_table or duplicate_object then null;
end;
$$;

-- El BNCR exige la "cuenta cliente" de 17 digitos, no el IBAN de 22.
do $$
begin
  alter table public.bncr_empleados add constraint bncr_empleados_cuenta_check
    check (cuenta_cliente ~ '^[0-9]{17}$');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.bncr_proveedores add constraint bncr_proveedores_cuenta_check
    check (cuenta_cliente ~ '^[0-9]{17}$');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.bncr_lotes add constraint bncr_lotes_tipo_check
    check (tipo in ('planilla', 'proveedores'));
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.bncr_lotes add constraint bncr_lotes_moneda_check
    check (moneda in ('CRC', 'USD'));
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.bncr_lotes add constraint bncr_lotes_cuenta_check
    check (cuenta_debito ~ '^[0-9]{17}$');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.bncr_detalles_pago add constraint bncr_detalles_tipo_check
    check (beneficiario_tipo in ('empleado', 'proveedor'));
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.bncr_detalles_pago add constraint bncr_detalles_monto_check
    check (monto_centimos > 0);
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.bncr_rubros_pago add constraint bncr_rubros_monto_check
    check (monto_centimos > 0);
exception when duplicate_object then null;
end;
$$;

create index if not exists bncr_lotes_fecha_idx on public.bncr_lotes (created_at desc);
create index if not exists bncr_lotes_tipo_idx on public.bncr_lotes (tipo);
create index if not exists bncr_detalles_lote_idx on public.bncr_detalles_pago (lote_id);
create index if not exists bncr_detalles_empleado_idx on public.bncr_detalles_pago (empleado_id);
create index if not exists bncr_detalles_proveedor_idx on public.bncr_detalles_pago (proveedor_id);
create index if not exists bncr_rubros_detalle_idx on public.bncr_rubros_pago (detalle_id);

-- Las escrituras pasan por el servidor con el service role, igual que el resto
-- del sistema; el navegador solo necesita lectura.
alter table public.bncr_empleados enable row level security;
alter table public.bncr_proveedores enable row level security;
alter table public.bncr_lotes enable row level security;
alter table public.bncr_detalles_pago enable row level security;
alter table public.bncr_rubros_pago enable row level security;

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'bncr_empleados', 'bncr_proveedores', 'bncr_lotes', 'bncr_detalles_pago', 'bncr_rubros_pago'
  ] loop
    begin
      execute format(
        'create policy "lectura autenticada %1$s" on public.%1$I for select to anon, authenticated using (true)',
        v_tabla
      );
    exception when duplicate_object then null;
    end;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
