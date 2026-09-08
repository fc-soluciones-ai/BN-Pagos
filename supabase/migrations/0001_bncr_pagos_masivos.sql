-- Modulo "Sistema de Pagos BNCR": catalogo de beneficiarios (empleados y
-- proveedores), lotes exportados al Banco Nacional y el desglose por
-- rubro/factura de cada deposito.
--
-- Corre sobre la MISMA base de datos centralizada del portal, en el esquema
-- public. El aislamiento es el estandar del portal: columna inquilino_id con
-- default current_inquilino_id() y RLS con esa misma funcion (que resuelve el
-- inquilino desde public.profiles y respeta el active_inquilino_id del
-- superadmin). No hay empresa_id: esa columna no existe en el portal.
--
-- Escrita de forma defensiva (if not exists / excepciones) para poder
-- correrse de nuevo sin romper nada.

-- ---------------------------------------------------------------------------
-- Requisitos del portal
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regproc('public.current_inquilino_id') is null then
    raise exception using
      message = 'Falta public.current_inquilino_id(): esta base no es la del portal FC.',
      hint = 'Corre primero el esquema del portal (profiles/inquilinos) y volve a ejecutar este script.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catalogo de beneficiarios
-- ---------------------------------------------------------------------------

create table if not exists public.bncr_empleados (
  id uuid primary key default gen_random_uuid(),
  inquilino_id uuid not null default current_inquilino_id(),
  -- Enlace al colaborador del modulo de planilla del portal (la FK se agrega
  -- mas abajo, solo si esa tabla ya existe en esta base).
  planilla_empleado_id uuid,
  cedula text not null,
  nombre text not null,
  -- Banco destino: el archivo del BNCR identifica al beneficiario por codigo
  -- de banco + cedula, asi que sin banco no se puede exportar.
  banco text not null default 'Banco Nacional',
  -- El IBAN no viaja en el archivo; se guarda porque es el dato con el que el
  -- cliente verifica a quien le esta pagando.
  cuenta_iban text,
  puesto text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.bncr_proveedores (
  id uuid primary key default gen_random_uuid(),
  inquilino_id uuid not null default current_inquilino_id(),
  cedula text not null,
  nombre text not null,
  banco text not null default 'Banco Nacional',
  cuenta_iban text,
  correo text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Lotes exportados
-- ---------------------------------------------------------------------------

-- Un lote es un archivo .env/.txt generado y descargado para subir a BN
-- Internet Corporativo.
create sequence if not exists public.bncr_lotes_consecutivo_seq;

create table if not exists public.bncr_lotes (
  id uuid primary key default gen_random_uuid(),
  inquilino_id uuid not null default current_inquilino_id(),
  consecutivo bigint not null default nextval('public.bncr_lotes_consecutivo_seq'),
  tipo text not null,
  descripcion text not null,
  -- Codigo de cliente/convenio de la empresa ante el BNCR (6 digitos).
  numero_cliente text not null,
  -- Cuenta patronal del BNCR de la que se debita el total (9 digitos).
  cuenta_origen text not null,
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

-- ---------------------------------------------------------------------------
-- Detalle de pagos
-- ---------------------------------------------------------------------------

-- Una fila por beneficiario y por lote, con el deposito ya acumulado. Es la
-- tabla del DDL acordado con el portal; las columnas de integracion (lote_id,
-- banco, linea, ...) se agregan despues para dejar el bloque base identico al
-- script original.
-- empleado_id se declara sin la FK y esta se agrega mas abajo solo si
-- planillas_empleados ya existe, para que el script tambien corra en una base
-- donde todavia no se desplego el modulo de planilla.
create table if not exists public.sistema_pagos_bncr (
  id uuid primary key default gen_random_uuid(),
  inquilino_id uuid not null default current_inquilino_id(),
  empleado_id uuid,
  cedula varchar(20) not null,
  -- El banco corta el concepto/nombre a 40; aplica igual para un proveedor.
  nombre_empleado varchar(40) not null,
  cuenta_iban varchar(22) not null,
  monto_pagar numeric(12, 2) not null default 0.00,
  moneda varchar(3) not null default 'CRC',
  estado varchar(50) not null default 'pendiente',
  periodo_planilla varchar(50),
  observacion varchar(255),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.sistema_pagos_bncr
  add column if not exists lote_id uuid references public.bncr_lotes(id) on delete cascade,
  add column if not exists beneficiario_tipo text,
  -- Beneficiario del catalogo de este modulo (empleado o proveedor). Se
  -- mantiene aparte de empleado_id, que apunta a planillas_empleados.
  add column if not exists beneficiario_id uuid,
  add column if not exists banco text,
  -- Los 30 caracteres, en mayusculas y sin tildes, que van en el archivo.
  add column if not exists concepto text,
  add column if not exists linea integer;

-- Desglose 1:N del deposito acumulado de cada beneficiario: rubros de planilla
-- (salario base, lavado de carro, descarga de maiz...) o facturas de proveedor.
create table if not exists public.bncr_rubros_pago (
  id uuid primary key default gen_random_uuid(),
  inquilino_id uuid not null default current_inquilino_id(),
  detalle_id uuid not null references public.sistema_pagos_bncr(id) on delete cascade,
  descripcion text not null,
  numero_factura text,
  monto_centimos bigint not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Migracion de instalaciones anteriores del modulo
-- ---------------------------------------------------------------------------

-- La primera version de este script llevaba empresa_id y cuenta_cliente de 17
-- digitos, que no existen en el portal ni en el archivo real del banco.
do $$
declare
  v_tabla text;
  v_con_datos boolean;
begin
  foreach v_tabla in array array[
    'bncr_empleados', 'bncr_proveedores', 'bncr_lotes', 'bncr_rubros_pago', 'sistema_pagos_bncr'
  ] loop
    execute format('alter table public.%I drop column if exists empresa_id', v_tabla);
    execute format(
      'alter table public.%I alter column inquilino_id set default current_inquilino_id()', v_tabla
    );
  end loop;

  foreach v_tabla in array array['bncr_empleados', 'bncr_proveedores'] loop
    execute format('alter table public.%I add column if not exists banco text', v_tabla);
    execute format('alter table public.%I add column if not exists cuenta_iban text', v_tabla);
    execute format('update public.%I set banco = ''Banco Nacional'' where banco is null', v_tabla);
    execute format('alter table public.%I alter column banco set not null', v_tabla);
    execute format('alter table public.%I alter column banco set default ''Banco Nacional''', v_tabla);
    execute format('alter table public.%I drop column if exists cuenta_cliente', v_tabla);
  end loop;

  -- La tabla de detalle anterior queda reemplazada por sistema_pagos_bncr. Si
  -- tiene filas no se borra: se conserva como respaldo para no perder
  -- historial de una instalacion que ya estuviera en uso.
  if to_regclass('public.bncr_detalles_pago') is not null then
    execute 'select exists (select 1 from public.bncr_detalles_pago)' into v_con_datos;
    if v_con_datos then
      execute 'alter table public.bncr_detalles_pago rename to bncr_detalles_pago_respaldo';
      raise notice 'bncr_detalles_pago tenia datos: se renombro a bncr_detalles_pago_respaldo.';
    else
      execute 'drop table public.bncr_detalles_pago cascade';
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Integridad con el modulo de planilla del portal
-- ---------------------------------------------------------------------------

-- La FK se crea solo si la tabla existe en esta base, para que el script no
-- falle en un entorno donde todavia no se haya desplegado ese modulo.
do $$
begin
  if to_regclass('public.planillas_empleados') is not null then
    begin
      alter table public.bncr_empleados
        add constraint bncr_empleados_planilla_fk
        foreign key (planilla_empleado_id) references public.planillas_empleados(id)
        on delete set null;
    exception when duplicate_object then null;
    end;

    begin
      alter table public.sistema_pagos_bncr
        add constraint sistema_pagos_bncr_empleado_fk
        foreign key (empleado_id) references public.planillas_empleados(id)
        on delete set null;
    exception when duplicate_object then null;
    end;
  else
    raise notice 'public.planillas_empleados no existe: se omite la llave foranea de planilla.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Restricciones
-- ---------------------------------------------------------------------------

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
  alter table public.bncr_lotes add constraint bncr_lotes_cuenta_origen_check
    check (cuenta_origen ~ '^[0-9]{1,9}$');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.bncr_lotes add constraint bncr_lotes_numero_cliente_check
    check (numero_cliente ~ '^[0-9]{1,6}$');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.sistema_pagos_bncr add constraint sistema_pagos_bncr_tipo_check
    check (beneficiario_tipo is null or beneficiario_tipo in ('empleado', 'proveedor'));
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.sistema_pagos_bncr add constraint sistema_pagos_bncr_monto_check
    check (monto_pagar >= 0);
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

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function public.bncr_tocar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sistema_pagos_bncr_updated_at on public.sistema_pagos_bncr;
create trigger sistema_pagos_bncr_updated_at
  before update on public.sistema_pagos_bncr
  for each row execute function public.bncr_tocar_updated_at();

-- ---------------------------------------------------------------------------
-- Indices
-- ---------------------------------------------------------------------------

-- El consecutivo del archivo es por inquilino, no global.
create unique index if not exists bncr_lotes_consecutivo_idx
  on public.bncr_lotes (inquilino_id, consecutivo);

create index if not exists bncr_lotes_fecha_idx on public.bncr_lotes (created_at desc);
create index if not exists bncr_lotes_tipo_idx on public.bncr_lotes (tipo);
create index if not exists sistema_pagos_bncr_lote_idx on public.sistema_pagos_bncr (lote_id);
create index if not exists sistema_pagos_bncr_beneficiario_idx
  on public.sistema_pagos_bncr (beneficiario_tipo, beneficiario_id);
create index if not exists sistema_pagos_bncr_empleado_idx on public.sistema_pagos_bncr (empleado_id);
create index if not exists bncr_rubros_detalle_idx on public.bncr_rubros_pago (detalle_id);

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'bncr_empleados', 'bncr_proveedores', 'bncr_lotes', 'bncr_rubros_pago', 'sistema_pagos_bncr'
  ] loop
    execute format(
      'create index if not exists %I on public.%I (inquilino_id)', v_tabla || '_tenant_idx', v_tabla
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

-- Aislamiento multi-tenant: cada quien ve unicamente las filas de su
-- inquilino, con la misma funcion que usa el resto del portal.
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'bncr_empleados', 'bncr_proveedores', 'bncr_lotes', 'bncr_rubros_pago', 'sistema_pagos_bncr'
  ] loop
    execute format('alter table public.%I enable row level security', v_tabla);
    -- Politicas de versiones anteriores de este script.
    execute format('drop policy if exists "lectura autenticada %s" on public.%I', v_tabla, v_tabla);
    execute format('drop policy if exists "aislamiento inquilino %s" on public.%I', v_tabla, v_tabla);
    -- sistema_pagos_bncr lleva la politica con el nombre acordado con el
    -- portal, que se crea aparte; dos politicas FOR ALL se sumarian con OR.
    continue when v_tabla = 'sistema_pagos_bncr';
    execute format(
      'create policy "aislamiento inquilino %1$s" on public.%1$I for all to authenticated'
      || ' using (inquilino_id = current_inquilino_id())'
      || ' with check (inquilino_id = current_inquilino_id())',
      v_tabla
    );
  end loop;
end;
$$;

drop policy if exists "Acceso por Inquilino Sistema Pagos BNCR" on public.sistema_pagos_bncr;
create policy "Acceso por Inquilino Sistema Pagos BNCR"
on public.sistema_pagos_bncr
for all to authenticated
using (inquilino_id = current_inquilino_id())
with check (inquilino_id = current_inquilino_id());

notify pgrst, 'reload schema';
