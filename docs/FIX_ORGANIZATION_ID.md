# Исправление ошибок при создании приглашений

**Дата:** 12 ноября 2025  
**Проблема:** Ошибка "organization_id is required" при создании пригласительной ссылки

---

## 🔍 Обнаруженные проблемы

### 1. Неправильное имя колонки в запросах
**Ошибка:** `column organization_employees.employee_role does not exist`

**Причина:** В таблице `organization_employees` колонка называется `role`, а не `employee_role`

**Исправлено в:**
- `src/pages/EmployeesPage.tsx` - заменено `employee_role` на `role` в запросах
- `src/pages/DiaryPage.tsx` - заменено `employee_role` на `role` в запросах

### 2. Функция `current_organization_id()` не определяет organization_id для организаций
**Ошибка:** `organization_id is required`

**Причина:** Функция `current_organization_id()` проверяла только:
- `user_profiles.organization_id`
- `organization_employees.organization_id`

Но не проверяла случай, когда пользователь - это сама организация (запись в таблице `organizations` с `user_id = auth.uid()`)

**Исправлено:**
- Создана миграция `20251112000002_014_fix_current_organization_id.sql`
- Функция теперь проверяет в порядке приоритета:
  1. `organizations.id` где `user_id = auth.uid()` (организация)
  2. `organization_employees.organization_id` (сотрудник)
  3. `user_profiles.organization_id` (клиент)

---

## 📝 Применение исправлений

### На сервере нужно:

1. **Применить новую миграцию:**
   ```bash
   ssh root@176.124.217.224 'cd /root/HealApp-Web && supabase db push'
   ```

   Или вручную выполнить SQL:
   ```sql
   -- Из файла supabase/migrations/20251112000002_014_fix_current_organization_id.sql
   create or replace function public.current_organization_id()
   returns uuid
   language sql
   stable
   security definer
   set search_path = public
   as $$
     select coalesce(
       (select id from organizations where user_id = auth.uid() limit 1),
       (select organization_id from organization_employees where user_id = auth.uid() limit 1),
       (select organization_id from user_profiles where user_id = auth.uid())
     );
   $$;
   ```

2. **Обновить код на сервере:**
   - Закоммитить изменения в `EmployeesPage.tsx` и `DiaryPage.tsx`
   - Задеплоить обновленный фронтенд

---

## ✅ Проверка исправлений

После применения миграции и обновления кода:

1. **Проверить создание приглашения:**
   - Войти как организация
   - Перейти в "Сотрудники"
   - Создать пригласительную ссылку
   - Должно работать без ошибки "organization_id is required"

2. **Проверить загрузку сотрудников:**
   - Список сотрудников должен загружаться без ошибки "employee_role does not exist"

---

## 📋 Измененные файлы

- ✅ `src/pages/EmployeesPage.tsx` - исправлено `employee_role` → `role`
- ✅ `src/pages/DiaryPage.tsx` - исправлено `employee_role` → `role`
- ✅ `supabase/migrations/20251111002253_007_rls_policies.sql` - обновлена функция `current_organization_id()`
- ✅ `supabase/migrations/20251112000002_014_fix_current_organization_id.sql` - новая миграция для применения на сервере

---

**Статус:** ✅ Исправления готовы, требуется применение на сервере

