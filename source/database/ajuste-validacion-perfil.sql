create or replace function calmavial_private.validar_identificacion() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v text;
begin
 foreach v in array array[new.nombres,new.apellido_paterno,new.apellido_materno] loop
  if v is not null and btrim(v)<>'' and (length(btrim(v))<2 or v !~ '^[[:alpha:]][[:alpha:] ''’.-]*$' or v ~ '[.]{2,}|[-]{2,}') then raise exception 'Nombres y apellidos: mínimo 2 caracteres, solo letras y separadores válidos.'; end if;
 end loop;
 if new.usuario is not null and btrim(new.usuario)<>'' and new.usuario !~ '^[[:alnum:]_.-]{3,50}$' then raise exception 'Nombre de usuario inválido.'; end if;
 if new.documento is not null and btrim(new.documento)<>'' and (new.documento !~ '^[[:alnum:]][[:alnum:] .-]{3,29}$' or new.documento !~ '[[:digit:]]') then raise exception 'Documento inválido: utiliza de 4 a 30 caracteres y al menos un número.'; end if;
 if new.direccion is not null and btrim(new.direccion)<>'' and (length(btrim(new.direccion))<5 or new.direccion ~ '[<>[:cntrl:]]' or new.direccion !~ '[[:alpha:]]') then raise exception 'Escribe una dirección de al menos 5 caracteres.'; end if;
 if new.genero is not null and btrim(new.genero)<>'' and new.genero not in ('Masculino','Femenino','Otro','Prefiero no decirlo') then raise exception 'Selecciona un género válido.'; end if;
 return new;
end $$;
