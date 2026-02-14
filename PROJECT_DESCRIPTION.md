# Повний опис проєкту

## 1. Загальна ідея та цілі

`Navchalnia Practika` — це веб-система керування процесом проведення наукової конференції: від подання статей до формування збірника матеріалів і видачі сертифікатів.

Ключова ціль проєкту:
- зібрати в одному місці робочий процес автора, рецензента й організатора;
- забезпечити контроль доступу на рівні БД (RLS), а не тільки в UI;
- мати прозору історію змін статусів статей;
- автоматизувати службові дії (сповіщення, призначення, дедлайни, сертифікати).

## 2. Що саме вирішує система

Система покриває такі етапи:

1. Автор реєструється, заповнює профіль, подає статтю і файл.
2. Організатор бачить подання, призначає рецензентів і дедлайни.
3. Рецензент отримує призначені статті, подає рецензії.
4. Організатор приймає фінальне рішення по статті.
5. Автор бачить статус, історію змін, рецензії, сповіщення.
6. Організатор формує DOC-збірник за заданим режимом відбору.
7. Після завершення конференції автори з прийнятими статтями отримують сертифікати.

## 3. Технологічний стек

### 3.1 Frontend
- `React 18`
- `TypeScript`
- `Vite`
- `Tailwind CSS` + власні стилі
- `i18next` / `react-i18next` для локалізації
- `lucide-react` для іконок

### 3.2 Backend (BaaS)
- `Supabase Auth`
- `Supabase Postgres`
- `Supabase Storage` (bucket `articles`)
- `RLS` на ключових таблицях
- SQL-функції, тригери, RPC

### 3.3 Документи
- `pdfmake`, `jspdf` для формування PDF (сертифікати)
- DOC-експорт збірника з даних системи

## 4. Рольова модель

Ролі:
- `author`
- `reviewer`
- `organizer`

Принципи:
- роль контролює доступ до сторінок (`src/App.tsx`) і до даних (RLS);
- роль `organizer` не може бути отримана self-service;
- при реєстрації користувач отримує тільки `author`.

## 5. Функціональні модулі

### 5.1 Автор

Може:
- подати статтю (`title`, `abstract`, `keywords`, `conference_id`, файл);
- переглядати свої статті та їх статус;
- переглядати рецензії до своїх статей;
- переглядати історію статусів на сторінці статті;
- працювати з профілем і персональними налаштуваннями;
- завантажувати сертифікати участі.

Особливості:
- формат файлів: `PDF`, `DOC`, `DOCX`;
- доступ до файлу статті через signed URL;
- підтримка фільтрів/сортування/пагінації в списках.

### 5.2 Рецензент

Може:
- бачити лише призначені йому статті (через `article_review_assignments`);
- фільтрувати статті за дедлайнами (all/overdue/upcoming), конференціями, пошуком;
- подавати рецензії з рейтингом та рекомендацією;
- бачити власну історію рецензій;
- читати файли тільки призначених йому статей.

### 5.3 Організатор

Може:
- бачити всі статті та рецензії;
- змінювати статуси статей;
- призначати рецензентів і керувати дедлайнами;
- планувати таймінг презентацій;
- переглядати історію статусів;
- формувати DOC-збірник;
- змінювати ролі користувачів (`author` <-> `reviewer`) через RPC;
- працювати з конференціями/секціями.

### 5.4 Система

Автоматизує:
- сповіщення про подання статті;
- сповіщення про зміну статусу;
- сповіщення рецензента про призначення;
- автофіксацію деяких подій (історія статусів, completion assignment).

## 6. Інформаційна архітектура (Frontend)

Ключові файли:

- `src/App.tsx`
  - рольовий роутинг;
  - обмеження доступу до сторінок за ролями.

- `src/contexts/AuthContext.tsx`
  - sign in / sign up / sign out;
  - зчитування профілю;
  - примусове створення профілю self-signup з роллю `author`.

- `src/components/Layout.tsx`
  - загальний shell застосунку;
  - role-based navigation.

- `src/components/dashboard/AuthorDashboard.tsx`
  - список статей автора;
  - список отриманих рецензій;
  - детальна сторінка статті.

- `src/components/dashboard/ReviewerDashboard.tsx`
  - список призначених статей;
  - форма рецензування;
  - список власних рецензій.

- `src/components/dashboard/OrganizerDashboard.tsx`
  - загальний dashboard;
  - all articles / all reviews;
  - manage status;
  - assignments;
  - proceedings generator.

- `src/components/dashboard/SubmitArticle.tsx`
  - форма подання статті;
  - upload файлу в storage bucket `articles`.

- `src/components/ProfileSettingsPage.tsx`
  - профіль і налаштування;
  - блок сертифікатів;
  - генерація PDF сертифікатів.

- `src/components/RoleManagementPage.tsx`
  - керування ролями через RPC.

- `src/components/NotificationsPage.tsx`
  - список сповіщень;
  - mark one / mark all as read.

## 7. Модель даних (Postgres)

### 7.1 Основні таблиці

- `profiles`
  - дані користувача, роль, установа, timestamps.

- `articles`
  - метадані статті, статус, автор, конференція, секція, файл.

- `reviews`
  - рецензії рецензентів, рейтинг, рекомендація, статус рецензії.

- `article_status_history`
  - журнал переходів статусу статті.

- `notifications`
  - внутрішні сповіщення користувачам.

### 7.2 Додаткові таблиці

- `article_review_assignments`
  - призначення рецензентів до статей;
  - дедлайн, completed_at, overdue_notified_at.

- `conferences`
  - сутність конференції (дати, статус, owner organizer, timezone, location).

- `conference_organizers`
  - many-to-many для кількох організаторів конференції.

- `conference_sections`
  - секції конференції (AI, Math, Econ тощо).

- `author_conference_certificates`
  - видані автору сертифікати за завершені конференції.

### 7.3 ENUM-и

- `user_role`: `author`, `reviewer`, `organizer`
- `article_status`: `submitted`, `under_review`, `accepted`, `accepted_with_comments`, `rejected`
- `review_status`: `draft`, `submitted`
- `conference_status`: `draft`, `announced`, `submission_open`, `reviewing`, `closed`, `archived`

## 8. Безпека: RLS, policy, тригери, RPC

### 8.1 RLS

RLS увімкнено на ключових таблицях:
- `profiles`, `articles`, `reviews`, `article_status_history`, `notifications`,
- `article_review_assignments`, `conferences`, `conference_organizers`, `conference_sections`, `author_conference_certificates`.

### 8.2 Ключові принципи доступу

- Автор бачить/редагує лише власні сутності в межах дозволених дій.
- Рецензент бачить тільки призначені статті й власні рецензії.
- Організатор має розширений доступ для керування workflow.

### 8.3 Захист ролей

- INSERT policy на `profiles` жорстко фіксує self-signup роль у `author`.
- Trigger `prevent_profile_role_escalation` блокує самостійну зміну ролі.
- RPC `organizer_set_user_role` виконує контрольовану зміну ролей.

### 8.4 Захист update статей

- Окремі UPDATE policy для автора та організатора.
- Trigger `enforce_articles_update_columns` обмежує, які поля хто може змінювати.

### 8.5 Storage security

Bucket `articles` є `private`.

На `storage.objects` залишено тільки 4 цільові policy:
- `Users can upload own article files` (INSERT)
- `Users can update own article files` (UPDATE)
- `Users can delete own article files` (DELETE)
- `Users can read article files by assignment` (SELECT)

Це прибирає legacy permissive-доступи й залишає тільки least-privilege модель.

## 9. Автоматизація та backend-логіка

### 9.1 Функції

Критичні `SECURITY DEFINER` функції:
- `organizer_set_user_role`
- `issue_own_conference_certificate`
- `notify_article_submitted`
- `notify_status_change`
- `ensure_conference_organizer_role`

### 9.2 Тригери

Критичні тригери:
- `enforce_articles_update_columns`
- `prevent_profile_role_escalation`
- `article_status_history_auto_log`
- `validate_article_section_link`
- `article_status_notification`
- `article_submitted_notification`
- `reviewer_assignment_notification`
- `mark_assignment_completed_on_review`

## 10. Міграції

Повний ланцюжок версій:

- `20260204171249`
- `20260205202244`
- `20260205202415`
- `20260205202508`
- `20260205202637`
- `20260207153000`
- `20260207180000`
- `20260207193000`
- `20260207200000`
- `20260207203000`
- `20260207213000`
- `20260207220000`
- `20260207221000`
- `20260207222000`
- `20260214110000`
- `20260214113000`
- `20260214121000`
- `20260214123000`
- `20260214124000`
- `20260214130000`
- `20260214143000`

Поточний стан: `supabase_migrations.schema_migrations` синхронізовано.

## 11. Локалізація, тема, UX

- Підтримка мов: `uk`, `en`
- Перемикач мови в UI
- Теми: `system`, `light`, `dark`
- Налаштування timezone/page size у профілі
- Адаптивні списки з пошуком, фільтрами, сортуванням і пагінацією

## 12. Формування збірника (Organizer)

Підтримані режими відбору:
- за конференцією;
- всі прийняті;
- за діапазоном дат;
- вручну (вибір окремих статей).

Результат:
- DOC-файл на основі даних статей, авторів, статусів, анотацій і ключових слів.

## 13. Сертифікати

Умови:
- конференція завершена;
- у автора є прийнята стаття (`accepted` або `accepted_with_comments`).

Механіка:
- автор бачить доступні сертифікати в профілі;
- система видає/читає сертифікат через RPC;
- файл сертифіката генерується у PDF.

## 14. Запуск, CI/CD, експлуатація

### 14.1 Локальний запуск

1. `npm ci`
2. створити `.env` із `.env.example`
3. заповнити:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. `npm run dev`

### 14.2 Скрипти

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run typecheck`
- `npm run preview`

### 14.3 CI/CD

- CI: `.github/workflows/ci.yml`
- Deploy: `.github/workflows/deploy-pages.yml` (push у `main`)

## 15. Фінальний health-check БД

За останнім прогоном health-check:
- `tables_present` — OK
- `enums_present` — OK
- `rls_enabled_on_core_tables` — OK
- `articles_bucket_private` — OK
- `storage_policies_expected_set` — OK
- `critical_triggers_present` — OK
- `critical_functions_security_definer` — OK
- `expected_migrations_registered` — OK
- `data_integrity_refs_and_certificate_uniqueness` — OK

## 16. Поточні обмеження

- Email-сповіщення у профілі зараз є як user preference; повноцінний серверний mail pipeline для всіх типів подій можна розширити окремо.
- DOC-збірник формує структурований документ із даних системи, а не робить literal merge оригінальних DOCX/PDF файлів.
- Для частини планових задач (масове нагадування по overdue) бажано підключити scheduler/cron.

## 17. Рекомендований roadmap

1. Додати scheduler для регулярних нагадувань і overdue-обробки.
2. Розширити модуль конференцій (CFP, треки, публічна програма).
3. Додати аудит-лог адміністративних дій у UI.
4. Додати e2e-тести рольових сценаріїв.
5. Додати smoke-test БД як обов'язкову pre-release процедуру.
