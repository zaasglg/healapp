-- Исправление политики clients_select для клиентов
-- Клиенты должны иметь возможность читать свою запись по user_id

drop policy if exists clients_select on clients;

create policy clients_select on clients
  for select using (
    public.is_service_role()
    or public.current_user_role() = 'admin'
    or public.has_client_access(id)
    or (
      public.current_user_role() = 'client'
      and user_id = auth.uid()
    )
  );

