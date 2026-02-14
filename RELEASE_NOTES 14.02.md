# Release Notes (dev -> main)

## Ключові зміни

- Додано сутність конференцій (MVP):
  - `conferences`
  - `conference_organizers` (many-to-many)
  - `conference_sections`
  - прив'язка `articles.conference_id`
- Додано демо-наповнення БД конференціями, секціями та тестовими статтями (UA/EN).
- Додано сторінку керування ролями для організатора та backend RPC для зміни ролей.
- Посилено безпеку реєстрації: self-signup профілю лише з роллю `author`.
- Додано блок сертифікатів автора (успішна участь у завершених конференціях) із генерацією PDF.
- Розширено сторінку статті: історія статусів, метадані, стабільний перегляд файлу.
- Оновлено дашборди `Author/Reviewer/Organizer`:
  - фільтри
  - сортування
  - пагінація
  - експорт CSV
  - покращення адаптивності та вирівнювання UI
- Розширено налаштування профілю (preferences, timezone/page size, UX-полірування).
- Додано утиліти для роботи з файлами статей і збереження налаштувань.

## Міграції БД (нові)

1. `supabase/migrations/20260214110000_add_conferences_core.sql`
2. `supabase/migrations/20260214113000_seed_conferences_demo.sql`
3. `supabase/migrations/20260214121000_article_page_history_and_metadata.sql`
4. `supabase/migrations/20260214123000_lock_self_signup_role_to_author.sql`
5. `supabase/migrations/20260214124000_add_role_management_rpc.sql`
6. `supabase/migrations/20260214130000_add_author_certificates.sql`

## Основні зміни у фронтенді

- Новий файл: `src/components/RoleManagementPage.tsx`
- Оновлені:
  - `src/components/dashboard/AuthorDashboard.tsx`
  - `src/components/dashboard/ReviewerDashboard.tsx`
  - `src/components/dashboard/OrganizerDashboard.tsx`
  - `src/components/dashboard/SubmitArticle.tsx`
  - `src/components/ProfileSettingsPage.tsx`
  - `src/components/NotificationsPage.tsx`
  - `src/components/Layout.tsx`
  - `src/components/auth/AuthForm.tsx`
- Локалізації:
  - `src/i18n/translations/en.ts`
  - `src/i18n/translations/uk.ts`
- Стилі:
  - `src/styles/components/dashboard.css`
  - видалено `src/styles/preferences/density.css`

## Безпека

- Обмежено самопризначення ролей при реєстрації (`author only`).
- Керування ролями винесене у контрольований механізм через RPC.

## Checklist після деплою

1. Перевірити створення/редагування конференцій і секцій.
2. Перевірити роль-менеджмент організатором.
3. Перевірити відображення сертифікатів у профілі автора.
4. Перевірити фільтри/сортування/експорт у дашбордах.
5. Перевірити формування збірника та історію статусів статей.
