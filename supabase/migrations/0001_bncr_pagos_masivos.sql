-- Modulo de Pagos Masivos BNCR: catalogo de beneficiarios (empleados y
-- proveedores), lotes exportados y su desglose por rubro/factura.
--
-- Se ejecuta sobre la MISMA base de datos centralizada del portal, en el
-- esquema public. Todas las tablas llevan el prefijo bncr_ para convivir sin
-- colisiones con las tablas que ya existen, y todas incluyen inquilino_id y
-- empresa_id con RLS de aislamiento multi-tenant.
-- Escrita de forma defensiva (if not exists) para poder correrse de nuevo.

create table if not exists public.bncr_empleados (
  id uuid primary key default gen_random_uuid(),
  inquilino_id uuid not null,
  empresa_id uuid not null,
  -- Enlace al colaborador del modulo de planilla del portal (ver el bloque de
  -- llaves foraneas mas abajo: solo se crea la FK si la tabla ya existe).
  planilla_empleado_id uuid,
  cedula text not null,
  nombre text not null,
  cuenta_cliente text not null,
  puesto text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.bncr_proveedores (
  id uuid primary key default gen_random_uuid(),
  inquilino_id uuid not null,
  empresa_id uuid not null,
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
  inquilino_id uuid not null,
  empresa_id uuid not null,
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
  inquilino_id uuid not null,
  empresa_id uuid not null,
  lote_id uuid not null references public.bncr_lotes(id) on delete cascade,
  beneficiario_tipo text not null,
  empleado_id uuid references public.bncr_empleados(id),
  proveedor_id uuid references public.bncr_proveedores(id),
  planilla_empleado_id uuid,
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
  inquilino_id uuid not null,
  empresa_id uuid not null,
  detalle_id uuid not null references public.bncr_detalles_pago(id) on delete cascade,
  descripcion text not null,
  numero_factura text,
  monto_centimos bigint not null,
  created_at timestamptz not null default now()
);

-- Si las tablas ya existian de una corrida anterior sin multi-tenant, se les
-- agregan las columnas de aislamiento.
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'bncr_empleados', 'bncr_proveedores', 'bncr_lotes', 'bncr_detalles_pago', 'bncr_rubros_pago'
  ] loop
    execute format('alter table public.%I add column if not exists inquilino_id uuid', v_tabla);
    execute format('alter table public.%I add column if not exists empresa_id uuid', v_tabla);
  end loop;

  alter table public.bncr_empleados add column if not exists planilla_empleado_id uuid;
  alter table public.bncr_detalles_pago add column if not exists planilla_empleado_id uuid;
end;
$$;

-- Integridad con el modulo de planilla del portal. La FK se crea solo si la
-- tabla existe en esta base, para que el script no falle en un entorno donde
-- todavia no se haya desplegado ese modulo.
do $$
begin
  if to_regclass('public.planillas_empleados') is not null then
    begin
      alter table public.bncr_empleados
        add constraint bncr_empleados_planilla_fk
        foreign key (planilla_empleado_id) references public.planillas_empleados(id);
    exception when duplicate_object then null;
    end;

    begin
      alter table public.bncr_detalles_pago
        add constraint bncr_detalles_planilla_fk
        foreign key (planilla_empleado_id) references public.planillas_empleados(id);
    exception when duplicate_object then null;
    end;
  else
    raise notice 'public.planillas_empleados no existe: se omiten las llaves foraneas de planilla.';
  end if;
end;
$$;

do $$
begin
  -- La cedula se repite entre inquilinos: la unicidad es por inquilino.
  alter table public.bncr_empleados
    add constraint bncr_empleados_cedula_key unique (inquilino_id, cedula);
exception when duplicate_table or duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.bncr_proveedores
    add constraint bncr_proveedores_cedula_key unique (inquilino_id, cedula);
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

-- El consecutivo del archivo es por inquilino, no global.
create unique index if not exists bncr_lotes_consecutivo_idx
  on public.bncr_lotes (inquilino_id, consecutivo);

create index if not exists bncr_lotes_fecha_idx on public.bncr_lotes (created_at desc);
create index if not exists bncr_lotes_tipo_idx on public.bncr_lotes (tipo);
create index if not exists bncr_detalles_lote_idx on public.bncr_detalles_pago (lote_id);
create index if not exists bncr_detalles_empleado_idx on public.bncr_detalles_pago (empleado_id);
create index if not exists bncr_detalles_proveedor_idx on public.bncr_detalles_pago (proveedor_id);
create index if not exists bncr_rubros_detalle_idx on public.bncr_rubros_pago (detalle_id);

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'bncr_empleados', 'bncr_proveedores', 'bncr_lotes', 'bncr_detalles_pago', 'bncr_rubros_pago'
  ] loop
    execute format(
      'create index if not exists %I on public.%I (inquilino_id, empresa_id)',
      v_tabla || '_tenant_idx', v_tabla
    );
  end loop;
end;
$$;

-- Aislamiento multi-tenant: cada quien ve unicamente las filas de su inquilino.
-- Las escrituras del modulo pasan por el servidor con el service role.
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'bncr_empleados', 'bncr_proveedores', 'bncr_lotes', 'bncr_detalles_pago', 'bncr_rubros_pago'
  ] loop
    execute format('alter table public.%I enable row level security', v_tabla);
    execute format('drop policy if exists "lectura autenticada %s" on public.%I', v_tabla, v_tabla);
    execute format('drop policy if exists "aislamiento inquilino %s" on public.%I', v_tabla, v_tabla);
    execute format(
      'create policy "aislamiento inquilino %1$s" on public.%1$I for all to authenticated'
      || ' using (inquilino_id = (auth.jwt() ->> ''inquilino_id'')::uuid)'
      || ' with check (inquilino_id = (auth.jwt() ->> ''inquilino_id'')::uuid)',
      v_tabla
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';
