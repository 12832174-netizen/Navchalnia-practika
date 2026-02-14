/*
  # Seed demo conferences and sections

  Creates demo conferences for presentation and pre-fills common sections.
  Safe to run multiple times (idempotent checks included).
*/

WITH ranked_organizers AS (
  SELECT
    id,
    email,
    row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public.profiles
  WHERE role = 'organizer'
),
primary_organizer AS (
  SELECT id FROM ranked_organizers WHERE rn = 1
),
secondary_organizer AS (
  SELECT id FROM ranked_organizers WHERE rn = 2
)
INSERT INTO public.conferences (
  title,
  description,
  thesis_requirements,
  start_date,
  end_date,
  submission_start_at,
  submission_end_at,
  organizer_id,
  status,
  timezone,
  location,
  is_public
)
SELECT
  'CUSU Student Research Conference 2026',
  'Annual student conference for computer science, mathematics, and economics tracks.',
  'Thesis length: 3-5 pages. Include problem statement, methods, results, and references.',
  DATE '2026-05-15',
  DATE '2026-05-16',
  TIMESTAMPTZ '2026-03-01 00:00:00+02',
  TIMESTAMPTZ '2026-04-20 23:59:59+03',
  p.id,
  'submission_open',
  'Europe/Kyiv',
  'Kropyvnytskyi, CUSU',
  true
FROM primary_organizer p
WHERE NOT EXISTS (
  SELECT 1
  FROM public.conferences c
  WHERE c.title = 'CUSU Student Research Conference 2026'
);

WITH ranked_organizers AS (
  SELECT
    id,
    row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public.profiles
  WHERE role = 'organizer'
),
secondary_organizer AS (
  SELECT id FROM ranked_organizers WHERE rn = 2
)
INSERT INTO public.conferences (
  title,
  description,
  thesis_requirements,
  start_date,
  end_date,
  submission_start_at,
  submission_end_at,
  organizer_id,
  status,
  timezone,
  location,
  is_public
)
SELECT
  'Applied AI and Data Science Forum 2026',
  'Focused forum for applied AI, data engineering, and analytics in education and business.',
  'Thesis length: 2-4 pages. Mandatory keywords and at least 5 references.',
  DATE '2026-06-10',
  DATE '2026-06-11',
  TIMESTAMPTZ '2026-03-10 00:00:00+02',
  TIMESTAMPTZ '2026-05-05 23:59:59+03',
  s.id,
  'announced',
  'Europe/Kyiv',
  'Online / Hybrid',
  true
FROM secondary_organizer s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.conferences c
  WHERE c.title = 'Applied AI and Data Science Forum 2026'
);

WITH base_conference AS (
  SELECT id
  FROM public.conferences
  WHERE title = 'CUSU Student Research Conference 2026'
),
secondary_organizer AS (
  SELECT id
  FROM public.profiles
  WHERE role = 'organizer'
  ORDER BY created_at, id
  OFFSET 1
  LIMIT 1
)
INSERT INTO public.conference_organizers (conference_id, organizer_id, role)
SELECT
  c.id,
  o.id,
  'co-organizer'
FROM base_conference c
CROSS JOIN secondary_organizer o
WHERE NOT EXISTS (
  SELECT 1
  FROM public.conference_organizers co
  WHERE co.conference_id = c.id
    AND co.organizer_id = o.id
);

WITH conference_target AS (
  SELECT id
  FROM public.conferences
  WHERE title = 'CUSU Student Research Conference 2026'
),
sections(code, name, description, sort_order) AS (
  VALUES
    ('AI', 'AI & Machine Learning', 'Applied and theoretical AI research.', 10),
    ('MATH', 'Mathematics', 'Pure and applied mathematics studies.', 20),
    ('ECON', 'Economics', 'Digital economy, analytics, and finance research.', 30),
    ('EDU', 'Education Technologies', 'EdTech platforms and learning analytics.', 40)
)
INSERT INTO public.conference_sections (conference_id, code, name, description, sort_order)
SELECT
  c.id,
  s.code,
  s.name,
  s.description,
  s.sort_order
FROM conference_target c
CROSS JOIN sections s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.conference_sections cs
  WHERE cs.conference_id = c.id
    AND lower(cs.name) = lower(s.name)
);

-- Seed status history for demo articles (idempotent).
WITH demo_articles AS (
  SELECT
    a.id,
    a.author_id,
    a.status,
    a.submitted_at
  FROM public.articles a
  WHERE a.title IN (
    'Автоматичне узагальнення наукових текстів українською мовою',
    'Оптимізація розкладу конференції на основі евристичних алгоритмів',
    'Оцінювання якості рецензування в академічних інформаційних системах',
    'Cross-Lingual Embeddings for Ukrainian Scientific Terminology',
    'Practical MLOps Pipeline for Student Research Projects',
    'Economic Impact Forecasting with Hybrid Time-Series Models'
  )
),
organizer_actor AS (
  SELECT id
  FROM public.profiles
  WHERE role = 'organizer'
  ORDER BY created_at, id
  LIMIT 1
),
history_events AS (
  -- Initial submission event for every article
  SELECT
    a.id AS article_id,
    NULL::public.article_status AS old_status,
    'submitted'::public.article_status AS new_status,
    a.author_id AS changed_by,
    'Article submitted by author'::text AS comments,
    COALESCE(a.submitted_at, now() - interval '10 days') AS created_at
  FROM demo_articles a

  UNION ALL

  -- Review stage event for articles that moved beyond submitted
  SELECT
    a.id AS article_id,
    'submitted'::public.article_status AS old_status,
    'under_review'::public.article_status AS new_status,
    o.id AS changed_by,
    'Article moved to review stage'::text AS comments,
    COALESCE(a.submitted_at, now() - interval '10 days') + interval '2 hours' AS created_at
  FROM demo_articles a
  CROSS JOIN organizer_actor o
  WHERE a.status IN ('under_review', 'accepted', 'accepted_with_comments', 'rejected')

  UNION ALL

  -- Final decision event for decided articles
  SELECT
    a.id AS article_id,
    'under_review'::public.article_status AS old_status,
    a.status AS new_status,
    o.id AS changed_by,
    CASE
      WHEN a.status = 'accepted' THEN 'Accepted for conference proceedings'
      WHEN a.status = 'accepted_with_comments' THEN 'Accepted with minor comments'
      WHEN a.status = 'rejected' THEN 'Rejected after review'
      ELSE 'Final decision recorded'
    END AS comments,
    COALESCE(a.submitted_at, now() - interval '10 days') + interval '3 days' AS created_at
  FROM demo_articles a
  CROSS JOIN organizer_actor o
  WHERE a.status IN ('accepted', 'accepted_with_comments', 'rejected')
)
INSERT INTO public.article_status_history (
  article_id,
  old_status,
  new_status,
  changed_by,
  comments,
  created_at
)
SELECT
  h.article_id,
  h.old_status,
  h.new_status,
  h.changed_by,
  h.comments,
  h.created_at
FROM history_events h
WHERE NOT EXISTS (
  SELECT 1
  FROM public.article_status_history ash
  WHERE ash.article_id = h.article_id
    AND ash.old_status IS NOT DISTINCT FROM h.old_status
    AND ash.new_status = h.new_status
    AND ash.comments IS NOT DISTINCT FROM h.comments
);

WITH authors AS (
  SELECT
    id,
    row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public.profiles
  WHERE role = 'author'
),
author_count AS (
  SELECT count(*) AS cnt FROM authors
),
conference_slots AS (
  SELECT 1 AS slot, id
  FROM public.conferences
  WHERE title = 'CUSU Student Research Conference 2026'
  UNION ALL
  SELECT 2 AS slot, id
  FROM public.conferences
  WHERE title = 'Applied AI and Data Science Forum 2026'
),
default_conference AS (
  SELECT id
  FROM public.conferences
  ORDER BY start_date, created_at, id
  LIMIT 1
),
article_templates (
  title,
  abstract,
  keywords,
  article_status,
  author_slot,
  conference_slot,
  submitted_offset_days,
  review_due_offset_days,
  presentation_offset_days,
  presentation_location
) AS (
  VALUES
    (
      'Автоматичне узагальнення наукових текстів українською мовою',
      'У статті розглянуто підходи до стислого представлення наукових текстів українською мовою з використанням сучасних трансформерних моделей та гібридних правил пост-обробки.',
      ARRAY['українська мова', 'NLP', 'узагальнення тексту'],
      'under_review'::public.article_status,
      1,
      1,
      12,
      3,
      45,
      'Секція AI, ауд. 204'
    ),
    (
      'Оптимізація розкладу конференції на основі евристичних алгоритмів',
      'Запропоновано модель автоматизованого формування розкладу секційних засідань із урахуванням обмежень аудиторій, часу доповідачів та пріоритетів організаторів.',
      ARRAY['оптимізація', 'алгоритми', 'розклад'],
      'submitted'::public.article_status,
      2,
      1,
      10,
      5,
      47,
      'Секція Math, ауд. 110'
    ),
    (
      'Оцінювання якості рецензування в академічних інформаційних системах',
      'Досліджено показники якості рецензування та запропоновано метрики прозорості процесу прийняття рішень у системах керування конференціями.',
      ARRAY['peer review', 'метрики', 'якість'],
      'accepted_with_comments'::public.article_status,
      3,
      1,
      16,
      1,
      50,
      'Секція Econ, ауд. 301'
    ),
    (
      'Cross-Lingual Embeddings for Ukrainian Scientific Terminology',
      'This paper evaluates cross-lingual embedding strategies for harmonizing Ukrainian and English scientific terminology across conference submission datasets.',
      ARRAY['cross-lingual', 'embeddings', 'terminology'],
      'accepted'::public.article_status,
      1,
      2,
      14,
      2,
      49,
      'AI Track, Room A'
    ),
    (
      'Practical MLOps Pipeline for Student Research Projects',
      'We present a lightweight MLOps pipeline for student teams, including experiment tracking, model registry, and automated reproducibility checks.',
      ARRAY['MLOps', 'reproducibility', 'student research'],
      'under_review'::public.article_status,
      2,
      2,
      9,
      4,
      46,
      'Data Science Track, Room B'
    ),
    (
      'Economic Impact Forecasting with Hybrid Time-Series Models',
      'The study compares hybrid ARIMA + gradient boosting approaches for short-term forecasting of regional economic indicators.',
      ARRAY['economics', 'forecasting', 'time-series'],
      'rejected'::public.article_status,
      3,
      2,
      18,
      NULL,
      NULL,
      NULL
    )
)
INSERT INTO public.articles (
  title,
  abstract,
  keywords,
  language,
  author_id,
  conference_id,
  status,
  submitted_at,
  review_due_at,
  presentation_starts_at,
  presentation_location,
  created_at,
  updated_at
)
SELECT
  t.title,
  t.abstract,
  t.keywords,
  CASE
    WHEN t.title ~ '[^ -~]' THEN 'uk'
    ELSE 'en'
  END,
  a.id AS author_id,
  COALESCE(c.id, dc.id) AS conference_id,
  t.article_status,
  now() - make_interval(days => t.submitted_offset_days),
  CASE
    WHEN t.review_due_offset_days IS NULL THEN NULL
    ELSE now() + make_interval(days => t.review_due_offset_days)
  END,
  CASE
    WHEN t.presentation_offset_days IS NULL THEN NULL
    ELSE now() + make_interval(days => t.presentation_offset_days)
  END,
  t.presentation_location,
  now(),
  now()
FROM article_templates t
JOIN author_count ac ON ac.cnt > 0
JOIN authors a ON a.rn = ((t.author_slot - 1) % ac.cnt) + 1
LEFT JOIN conference_slots c ON c.slot = t.conference_slot
CROSS JOIN default_conference dc
WHERE NOT EXISTS (
  SELECT 1
  FROM public.articles ex
  WHERE ex.title = t.title
    AND ex.author_id = a.id
);

WITH conference_target AS (
  SELECT id
  FROM public.conferences
  WHERE title = 'Applied AI and Data Science Forum 2026'
),
sections(code, name, description, sort_order) AS (
  VALUES
    ('DS', 'Data Science', 'Data pipelines, modeling, and evaluation.', 10),
    ('NLP', 'NLP', 'Language technologies and text analytics.', 20),
    ('CV', 'Computer Vision', 'Image/video understanding and applications.', 30)
)
INSERT INTO public.conference_sections (conference_id, code, name, description, sort_order)
SELECT
  c.id,
  s.code,
  s.name,
  s.description,
  s.sort_order
FROM conference_target c
CROSS JOIN sections s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.conference_sections cs
  WHERE cs.conference_id = c.id
    AND lower(cs.name) = lower(s.name)
);
