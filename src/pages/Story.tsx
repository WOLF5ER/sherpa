import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Check, ChevronDown, ChevronRight, Gift, Lock, Sparkles } from 'lucide-react'
import { useProfile } from '@/store/profile'
import { useTaskViews } from '@/lib/useCtx'
import type { TaskView } from '@/lib/tasks'
import { Progress, TraderMark } from '@/components/ui'
import { toast } from '@/store/toast'

interface StoryObjective {
  /** полный ключ storyGate «Глава: Цель» */
  gate: string
  objective: string
  quests: TaskView[]
}
interface Chapter {
  name: string
  objectives: StoryObjective[]
}

/** Переводим главы и цели с английского (в данных они en-строками). */
const CHAPTER_RU: Record<string, string> = {
  Tour: 'Тур',
  Boreas: 'Борей',
}
/** Сюжетный порядок глав (Tour — вступительная) */
const CHAPTER_ORDER = ['Tour', 'Falling Skies', 'The Ticket', 'Batya', 'Accidental Witness', 'Blue Fire', 'Boreas', 'The Labyrinth', 'The Unheard', 'They Are Already Here']

/**
 * Гид по главам (данных tarkov.dev по ним нет — главы после Тура открываются через мир: записки, места).
 * main — обязательные для основной концовки, остальные влияют на «лучшую» концовку.
 */
const CHAPTER_GUIDE: Record<string, { ru: string; how: string; main?: boolean; steps?: string[]; reward?: string }> = {
  'Tour': { ru: 'Тур', main: true, how: 'Вступительная глава — добавляется автоматически при запуске игры. Знакомство с торговцами и доступ к картам.', reward: 'Открывает торговцев (Лыжник, Механик, Прапор, Миротворец) и локации: Улицы Таркова, Таможня, Завод, Лес, Берег, Резерв, Маяк, Лаборатория.', steps: [
    'Выбраться из Эпицентра — обучающий рейд, выход «Улица Климова (Сигнал)» за бизнес-центром Skyside',
    'Поговорить с Терапевтом и передать 250 000 ₽ — откроет Улицы Таркова',
    'Поговорить с Барахольщиком; выжить на Развязке или посетить её 3 раза — откроет Лыжника и Таможню',
    'Лыжник: передать 5 стройматериалов (найденных в рейде); выжить на Таможне или посетить 3 раза — откроет Механика и Завод',
    'Механик: передать 2 ед. оружия (найденных в рейде); выжить на Заводе или посетить 3 раза — откроет Прапора и Лес',
    'Лыжник: убить 3 любые цели в Лесу и выжить (или 3 визита) — откроет Миротворца и Берег',
    'Найти вход в портовый Терминал (юго-восток Берега) и связаться с гарнизоном через интерком у сторожевой вышки — к стене не подходить, военные стреляют',
    'Узнать, как выбраться из Таркова',
    'Доступ на Резерв: выжить на Берегу или посетить 3 раза + передать Прапору 5 армейских жетонов (в рейде)',
    'Доступ на Маяк: передать Механику 8 000 $',
    'Доступ в Лабораторию: попасть на секретный объект TerraGroup, найти путь отхода через водосток, осмотреть серверную и офисы топ-менеджеров',
  ] },
  'Falling Skies': { ru: 'Небеса в огне', main: true, how: 'Спроси Механика про упавший самолёт по ходу главы «Тур». Первая глава с сюжетным выбором.', reward: '+80 000 EXP · кейс Прапору: 1 500 000 ₽ и достижение «Слово мужчины» · кейс себе: сам кейс, −0.7 репутации Прапора и достижение «Просто бизнес». Плюс 300 000 ₽ по ходу главы.', steps: [
    'Найти упавший самолёт в Лесу (восточная часть карты)',
    'Поднять лояльность с Прапором до 2 ур. и расспросить торговцев о самолёте (опц.: заплатить Терапевту 2 000 $ за подсказку про внедорожник)',
    'Найти флешку на подножке чёрного Gelandewagen у выхода «Туннель» на Берегу и передать её Прапору',
    'Дождаться информации от Прапора (~1 час)',
    'Найти чёрный ящик в разломе у хвоста самолёта и заложить его в разрушенной комнате дома на острове на Берегу',
    'Передать Прапору найденные в рейде: 3 аккумуляторные батареи, 5 печатных плат, 2 набора инструментов — и снова дождаться вестей',
    'Дом старосты на Берегу: стенограмма переговоров экипажа и защищённая флешка Электроника — передать Прапору и дождаться вестей',
    'Найти бронированный кейс (опц.: дополнительные улики — записка от Mr. Kerman)',
    'Выбор: оставить бронированный кейс себе или передать его Прапору',
  ] },
  'The Ticket': { ru: 'Билет', main: true, how: 'Открывается после «Небес в огне». Основная линия — ведёт к одной из четырёх концовок.', reward: 'Выход из Таркова — одна из четырёх концовок (рейд на Терминал).', steps: [
    'Нужен Разведцентр 1 ур. — поговорить с мистером Керманом и дождаться его выхода на связь',
    'Поговорить с Прапором, найти лагерь его людей на Маяке и зацепки об их намерениях',
    'Получить доступ к Смотрителю и не терять его',
    'Найти 3 документа компании TerraGroup и отнести Смотрителю',
    'Запустить жёлтый сигнальный патрон у главного входа ТРЦ «Ультра» на Развязке',
    'Устранить 15 целей за один рейд на Развязке и поговорить со Смотрителем',
    'Разблокировать замок бронированного кейса и получить «Билет»',
    'Через Механика найти экспериментальный подавитель сигналов (Лаборатория) и вскрыть им кейс',
    'Прочитать инструкцию из кейса и принять предложение мистера Кермана',
    'Активировать RFID-карту из кейса (Солнечная батарея 1 ур., чистая RFID-карта, мастер-пропуск в Лабораторию)',
    'Устройство шифрования RFID: Механик → 40 монет биткоина для Электроника → забрать устройство (квартира Круглова на Улицах Таркова)',
    'Прийти ко входу в портовый Терминал и провести карту в считывателе интеркома',
    'Путь Прапора: передать 300 000 000 ₽ (кейс был отдан) или 500 000 000 ₽ (кейс оставлен себе)',
    'Задания Прапора в срок: оцифровать 4 папки компромата на SSD-диск, устранить 50 целей на Улицах Таркова, устранить 4 ЧВК за один рейд',
    'Передать Прапору защищённый контейнер «Каппа»',
    'Путь Кермана: согласиться искать компромат, Разведцентр 3 ур., передать 8 крупных компроматов на TerraGroup (опц.: 36 мелких)',
    'Скупщик: репутация 4.0 и не опускать ниже, его поручение, выходы «Мост дружбы» (Лес) и «Дикие места» (Резерв)',
    'Репутация с мехводом БТР до 0.4, Солнечная батарея 1 ур.',
    'Путь Смотрителя: материалы разведки на 5 локациях → военный флеш-накопитель Смотрителю, 30 ЧВК в Лесу, 100 жетонов ЧВК',
    '6 амулетов из меченых комнат (Таможня, Улицы ×2, Резерв ×3) — заложить в схроне на Маяке и сообщить Смотрителю',
    'Альтернатива — Прапор: 50 ед. военной/продвинутой электроники, контейнер «Тета»/«Эпсилон»/«Каппа», 40 ремнаборов, кейс с опасным содержимым, 1 000 000 $',
    'Забрать у Прапора обновлённые хэш-коды и дождаться информации',
    'Финал — Терминал: проверка на КПП, арсенал конфиската, контейнер «Альфа-1», путь через погрузочную зону и насосную к пирсу — сбежать из Таркова',
  ] },
  'Batya': { ru: 'Батя', how: 'Найди след спецподразделения BEAR — патч Богатырей (Таможня, Резерв, Берег или Лес).', reward: '+144 000 EXP · диктофон Воеводы · достижение «Это всё (не) случайность».', steps: [
    'Найти след спецподразделения BEAR (опц.: патч Богатырей)',
    'Узнать у торговцев больше о Богатырях',
    'Найти позицию «Рябина» и информацию о Богатырях (опц.: памятный предмет одного из них)',
    'Найти форпост «Карусель» и личные записи Богатырей',
    'Узнать больше о Стрельце, Таране и Воеводе (опц.: личный предмет Богатырей)',
    'Найти личные вещи Воеводы (опц.: личные вещи командира отряда)',
    'Найти форпост «Гнездо» и обыскать его',
    'Узнать, что случилось с Богатырями: где они попали в засаду, чем занимались и кто в отряде',
    'Найти место засады и осмотреть труп Моремана (опц.: его телефон и жетон одного из Богатырей)',
    'Изучить все данные с телефона Моремана и достать из него больше информации о засаде',
    'Улучшить Разведцентр до 3 ур. и выйти на связь с Богатырями',
    'Получить доступ к Смотрителю и передать ему знаки принадлежности: диктофон Воеводы, открытка Тарана, амулет Стрельца, жетон Моремана, патч Богатырей',
    'Дождаться, когда Воевода выйдет на связь',
    'Прокачать навыки: Лёгкие пулемёты 5 ур., Штурмовые винтовки 10 ур., Стрессоустойчивость 10 ур., Сила 15 ур.',
    'Устранить 15 любых целей и 4 ЧВК, не умерев, и связаться с Воеводой',
    'Найти след предателей (опц.: командный центр в бункере на Резерве, лагеря BEAR на Маяке и у Ультры на Развязке)',
    'Допросить Прапора; узнать, как сектанты связаны с Генералом (опц.: круги сектантов на Таможне, Резерве, в Лесу и на Берегу)',
    'Поговорить со Смотрителем, дождаться документов о Неизвестных и прочесть отчёт о развёртывании агентурной сети',
  ] },
  'Accidental Witness': { ru: 'Случайный свидетель', how: 'Осмотри разрисованные машины между общежитиями на Таможне.', reward: '+64 000 EXP · достижение «Верни долг».', steps: [
    'Узнать, где жил Козлов, и прочитать записку на двери его комнаты',
    'Узнать, чем занимался Козлов (опц.: найти ключ и осмотреть комнату 110)',
    'Спросить у торговцев про Анастасию',
    'Посетить квартиру подельника Лыжника (опц.: найти ключ), узнать о нём больше и прочесть документы в квартире',
    'Выжить и эвакуироваться с Улиц Таркова, сообщить Лыжнику о выполнении',
    'Поговорить с Барахольщиком',
    'Найти квартиру Анастасии, узнать о ней больше и осмотреть подъезд её дома',
    'Найти курьера Пашу и обыскать место нападения',
    'Поговорить с Лыжником',
    'Найти схрон Решалы (опц.: нейтрализовать Решалу, найти ключ от схрона)',
    'Осмотреть времянку Решалы (опц.: его рабочие заметки и вещи курьера Паши)',
    'Найти убежище Козлова и его компромат',
  ] },
  'Blue Fire': { ru: 'Синий огонь', how: 'Прочти листовку МЧС — зелёный контейнер на военной базе в Лесу или палатки/медзона на Развязке.', reward: '+112 000 EXP · 1 500 000 ₽ · достижения «Себе нужнее» и «Гори!».', steps: [
    'Поговорить с Механиком об ЭМИ-импульсе (опц.: получить доступ к Механику)',
    'Найти обломок устройства и передать его Механику',
    'Заложить устройство взлома в серверной на локации Лаборатория',
    'Поговорить с Механиком',
    'Выбор: оставить осколок Изделия 1156 у себя или передать его Механику',
    'Найти зацепку по Изделию 1156',
    'Проверить почтовое отделение «Почты Руси»',
    'Найти машину «Почты Руси»',
    'Найти чертежи Изделия 1156',
  ] },
  'Boreas': { ru: 'Борей', how: 'Сигнал бедствия ведёт на замёрзший Ледокол — штурм надстройки и спасение капитана.', reward: 'СЗ-1 в продаже у Прапора · данные из архива ледокола · ключ-карта от отсека С-3 · достижения «Трещины во льду» (за главу) и «Часть корабля, часть команды» (все секреты ледокола).', steps: [
    'Узнать у торговцев о связи TerraGroup и Paradigm Shipping / спросить Механика, откуда пришёл сигнал бедствия',
    'Найти и починить оборудование под вышкой сотовой связи в Лесу, вернуться к Механику',
    'Найти документацию Paradigm Shipping и рассказать Механику про «Борей»',
    'Договориться о транспорте на ледокол',
    'Путь Прапора: масло АМГ-10, 3 военных фильтра питания (найденные в рейде), 30 целей на Резерве, жёлтый сигнальный патрон у транзита в Лес',
    'Путь мехвода БТР: 200 патронов 7.62x54R БТ гж, найти и сжечь отчёты Лыжника на Таможне, зачистка территории контрабандистов (15 и 10 целей)',
    'Сесть на катер контрабандистов на Берегу (взять 700 000 ₽ на заброску, зелёный сигнал РСП и 2 500 € на эвакуацию)',
    'Попасть на Ледокол и проверить, не осталось ли выживших членов экипажа',
    'Попасть в машинное отделение (опц.: ключ-карта инженера) и найти путь в надстройку',
    'Взрывчатка: спросить Механика и Прапора; сорвать цепь СЗ-1 с двери на крыше машинного отделения',
    'Войти в надстройку с крыши машинного отделения (опц.: жилые отсеки) и найти путь на верхние уровни',
    'Выживший учёный подскажет код от двери 6 уровня; Механик поможет со второй частью — заложить устройство удалённого взлома в серверной Лаборатории',
    'Добраться до кодовой двери и ввести правильный код',
    'Найти отсек С-1 (опц.: ключ-карта доступа, мостик или альтернативный путь)',
    'Разморозить люк на крыше мостика и спасти капитана ледокола',
    'Осмотреть отсек С-1: полки, рабочая станция, серверы',
    'Механик расшифрует диски: передать 3 модуля спутниковой связи Ultralink, 4 серверных RAM-модуля, 2 криптопроцессора (всё найденное в рейде)',
    'Изучить данные с ледокола и сообщить учёному о смерти капитана',
    'Эвакуация учёного через мехвода БТР: помочь контрабандистам в конфликте с отступниками, 20 целей на ледоколе, 5 респираторов, 2 бронеплиты 5+ класса, бронежилет «Кираса-N»',
  ] },
  'The Labyrinth': { ru: 'Лабиринт', how: 'Тоннель в подвале санатория на Берегу — туда ведёт цепочка Механика.', reward: 'Достижение «Тесей» — за раскрытие тайны Лабиринта.', steps: [
    'Разблокировка: тоннель в подвале западного корпуса санатория на Берегу (нужен ключ от наружной двери)',
    'Спроси торговцев (Егеря) о подземном комплексе',
    'Дождись, пока Егерь соберёт ключ-карты (24–48 часов)',
    'Найди вход в подземный комплекс под санаторием и спустись внутрь',
    'Найди в Лабиринте следы отряда BEAR и их точку сбора у объекта 1156',
    'Найди командира отряда и собери больше сведений',
    'Попади в запертый офис (ключ у одного из шести учёных в белых халатах — возьми большой пустой рюкзак) и прослушай кассету',
    'Отнеси кассету Егерю; найди отчёт о разработке комплекса «Лабиринт» (сброшен в канализацию)',
  ] },
  'The Unheard': { ru: 'Неизвестные', how: 'Прочти записку об «Очищении» — пост охраны или офисы TerraGroup на Улицах Таркова, либо офис №4 в главном здании TerraGroup в Центре (нужен ключ учёного).', reward: '+128 000 EXP · достижение «Дорога из хлебных крошек».', steps: [
    'Узнать больше о Неизвестных',
    'Найти больше информации о деятельности TerraGroup и о «топливе» из записки',
    'Найти больше информации об особой поставке катализатора',
    'Найти служебный автомобиль Ржевского и его личные вещи',
    'Достать данные с жёсткого диска из машины Ржевского и прочитать расшифровку его разговора',
    'Найти документы об исследованиях топливного катализатора Blue Ice',
    'Найти максимум информации о планах Неизвестных',
    'Узнать больше о деятельности и роли А.П.; поискать упоминания о нём в лаборатории TerraGroup',
    'Найти номер А.П. в санатории, его личные вещи и носитель данных',
    'Расшифровать флешку из номера А.П.',
    'Попросить помощи у Механика: передать 5 000 000 ₽ и флешку А.П., дождаться информации от Электроника',
    'Интегрировать техфайлы с флешки А.П. в ключ-карту TerraGroup',
    'Посетить служебную квартиру А.П., осмотреть её и найти скрытую комнату',
    'Изучить документацию TerraGroup в кабинете А.П. и роль катализатора Blue Ice в протоколе Неизвестных',
    'Узнать, как Неизвестные связаны с Тарковом',
  ] },
  'They Are Already Here': { ru: 'Они уже здесь', how: 'Записка об «Оке мира»: «комнаты пыток» сектантов (общага на Таможне, RB-BK / RB-PKPM / RB-VO на Резерве, Заброшенная деревня в Лесу, остров на Берегу) или тело сектанта.', reward: '+128 000 EXP · достижения «Чужими глазами» и «И свет погас».', steps: [
    'Узнать больше о людях в капюшонах и тех, кто оставляет в Таркове странные символы',
    'Найти место, связанное с Глазом Мира',
    'Узнать больше о жертве сектантов в пыточной и найти её квартиру (опц.: ключ от квартиры)',
    'Изучить квартиру жертвы и найти первую аудиокассету',
    'Найти и прочитать книгу, которую сектанты подбросили Игорю',
    'Спросить Механика, что он знает о Глазе Мира',
    'Найти и убить жреца сектантов',
    'Точка Глаза Мира на Маяке: осмотреть разрушенный номер в шале (опц.: личные вещи жертвы) и найти ключ из записки жертвы',
    'Точка Глаза Мира в Лесу: изучить дом сектантов',
    'Точка Глаза Мира на Берегу: изучить окрестности вышки Sordi и починить вышку связи',
    'Восстановить ключ-карту Аршавина',
    'Попасть на секретный объект НПО «Кобальт»',
    'Включить питание станции и систему охлаждения в серверной',
    'Установить флешку для скачивания данных, тщательно осмотреть станцию ARRS 14-4 KORD, выжить и покинуть Развязку',
    'Найти способ отключить станцию от внешних агентов и восстановить резервные настройки ARRS',
    'Забрать флешку с данными, выжить и передать её Механику',
    'Прочитать спецификацию системы ARRS',
  ] },
}
const OBJECTIVE_RU: Record<string, string> = {
  'Talk to Therapist': 'Поговорить с Терапевтом',
  'Talk to Skier': 'Поговорить с Лыжником',
  'Talk to Mechanic': 'Поговорить с Механиком',
  'Talk to Ragman': 'Поговорить с Барахольщиком',
  'Ask Mechanic for help decoding the hard drives from the icebreaker': 'Попросить Механика расшифровать диски с Ледокола',
}

export function StoryPage() {
  const views = useTaskViews()
  const storyDone = useProfile((s) => s.storyDone)
  const toggleStory = useProfile((s) => s.toggleStory)
  /** раскрытые главы (по умолчанию всё свёрнуто) */
  const [open, setOpen] = useState<Record<string, boolean>>({})

  /** проставить/снять сразу несколько ключей */
  const setMany = (keys: string[], value: boolean) => { for (const k of keys) if (!!storyDone[k] !== value) toggleStory(k) }
  /** каскад: отметил шаг — закрылись все предыдущие; снял — открылись все следующие; последний шаг закрывает главу */
  const toggleStep = (c: Chapter, steps: string[], i: number) => {
    const keys = steps.map((_, j) => `step:${c.name}:${j}`)
    const chapterKey = `chapter:${c.name}`
    if (!storyDone[keys[i]]) {
      setMany(keys.slice(0, i + 1), true)
      if (i === steps.length - 1) {
        if (!storyDone[chapterKey]) toggleStory(chapterKey)
        toast(`Глава пройдена: ${CHAPTER_GUIDE[c.name]?.ru ?? c.name}`, 'ok')
      }
    } else {
      setMany(keys.slice(i), false)
      if (storyDone[chapterKey]) toggleStory(chapterKey)
    }
  }
  /** галочка на главе: закрыть/открыть главу целиком (шаги + цели) */
  const toggleChapterAll = (c: Chapter) => {
    const guide = CHAPTER_GUIDE[c.name]
    const keys = [`chapter:${c.name}`, ...c.objectives.map((o) => o.gate), ...(guide?.steps ?? []).map((_, j) => `step:${c.name}:${j}`)]
    const done = !storyDone[`chapter:${c.name}`]
    setMany(keys, done)
    toast(done ? `Глава пройдена: ${guide?.ru ?? c.name}` : `Отметки сняты: ${guide?.ru ?? c.name}`, done ? 'ok' : 'info')
  }

  const chapters = useMemo(() => {
    const byChapter = new Map<string, Map<string, TaskView[]>>()
    for (const v of views.values()) {
      const g = v.task.storyGate
      if (!g) continue
      const sep = g.indexOf(':')
      const chapter = sep === -1 ? g : g.slice(0, sep)
      ;(byChapter.get(chapter) ?? byChapter.set(chapter, new Map()).get(chapter)!)
        .set(g, [...(byChapter.get(chapter)!.get(g) ?? []), v])
    }
    // главы из гида без данных тоже показываем (открываются через мир, а не квесты)
    for (const name of CHAPTER_ORDER) if (!byChapter.has(name)) byChapter.set(name, new Map())
    const out: Chapter[] = []
    for (const [name, objs] of byChapter) {
      const objectives: StoryObjective[] = [...objs.entries()]
        .map(([gate, quests]) => ({ gate, objective: gate.slice(gate.indexOf(':') + 1).trim(), quests: quests.sort((a, b) => a.task.minPlayerLevel - b.task.minPlayerLevel) }))
        .sort((a, b) => a.objective.localeCompare(b.objective, 'ru'))
      out.push({ name, objectives })
    }
    // порядок глав — сюжетный (Тур первая), неизвестные — в конец по алфавиту
    const order = (name: string) => { const i = CHAPTER_ORDER.indexOf(name); return i === -1 ? CHAPTER_ORDER.length : i }
    return out.sort((a, b) => order(a.name) - order(b.name) || a.name.localeCompare(b.name, 'ru'))
  }, [views])

  const total = chapters.reduce((n, c) => n + c.objectives.length, 0)
  const doneN = chapters.reduce((n, c) => n + c.objectives.filter((o) => storyDone[o.gate]).length, 0)

  return (
    <div className="p-5 max-w-[1100px] mx-auto flex flex-col gap-4">
      <header>
        <h1 className="display text-[34px] text-ink">Сюжет</h1>
        <div className="mt-1 text-[13px] text-ink-3">
          Главы сюжета и их цели. Прогресс глав игра не отдаёт — отмечай вручную; цели «Тура» и «Борея» отпирают запертые за ними квесты.
          {total > 0 && <span className="num"> · <span className="text-fir">{doneN}</span> из {total} целей</span>}
        </div>
      </header>

      {chapters.map((c) => {
        const guide = CHAPTER_GUIDE[c.name]
        const chapterKey = `chapter:${c.name}`
        const chapterDone = !!storyDone[chapterKey]
        const gatesDone = c.objectives.filter((o) => storyDone[o.gate]).length
        const stepsDone = guide?.steps ? guide.steps.filter((_, i) => storyDone[`step:${c.name}:${i}`]).length : 0
        const isOpen = !!open[c.name]
        return (
          <section key={c.name} className="panel p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => toggleChapterAll(c)}
                title={chapterDone ? 'Снять отметку со всей главы' : 'Отметить главу пройденной целиком'}
                className={`w-5 h-5 shrink-0 rounded-[4px] border grid place-items-center transition-colors ${chapterDone ? 'bg-fir/20 border-fir text-fir' : 'border-line-2 text-transparent hover:border-brass hover:text-brass/60'}`}
              >
                <Check size={13} strokeWidth={3} />
              </button>
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [c.name]: !o[c.name] }))}
                title={isOpen ? 'Свернуть главу' : 'Развернуть главу'}
                className="flex-1 min-w-0 flex items-center gap-2 flex-wrap text-left group"
              >
              {isOpen
                ? <ChevronDown size={15} className="text-ink-3 group-hover:text-brass-2 transition-colors" />
                : <ChevronRight size={15} className="text-ink-3 group-hover:text-brass-2 transition-colors" />}
              <BookOpen size={15} className={guide?.main ? 'text-brass-2' : 'text-ink-3'} />
              <h2 className={`display text-[20px] transition-colors ${chapterDone ? 'text-ink-3 line-through' : 'text-ink group-hover:text-brass-2'}`}>{guide?.ru ?? CHAPTER_RU[c.name] ?? c.name}</h2>
              <span className="text-[12px] text-ink-4">{c.name}</span>
              {guide?.main
                ? <span className="display text-[10px] text-brass border border-brass-3 rounded-[3px] px-1 leading-[14px]" title="Обязательна для основной концовки">Основная</span>
                : <span className="display text-[10px] text-ink-3 border border-line-2 rounded-[3px] px-1 leading-[14px]" title="Необязательная глава — нужна для «лучшей» концовки">Побочная</span>}
              {c.objectives.length > 0 && <span className="ml-auto num text-[12px] text-ink-3">{gatesDone}/{c.objectives.length} целей</span>}
              {guide?.steps && <span className={`${c.objectives.length > 0 ? '' : 'ml-auto '}num text-[12px] ${stepsDone === guide.steps.length ? 'text-fir' : 'text-ink-3'}`}>{stepsDone}/{guide.steps.length} шагов</span>}
              </button>
            </div>
            {isOpen && <>
            {guide && <p className="text-[13px] text-ink-3 leading-snug">{guide.how}</p>}
            {guide?.reward && (
              <p className="flex items-start gap-1.5 text-[12.5px] text-brass-2/90 leading-snug">
                <Gift size={13} className="mt-0.5 shrink-0" /> <span><span className="display text-[11px] text-brass">НАГРАДА: </span>{guide.reward}</span>
              </p>
            )}
            {guide?.steps && (
              <ol className="flex flex-col gap-1">
                {guide.steps.map((step, i) => {
                  const key = `step:${c.name}:${i}`
                  const stepDone = !!storyDone[key]
                  return (
                    <li key={key} className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => toggleStep(c, guide.steps!, i)}
                        title={stepDone ? 'Снять отметку (снимет и следующие шаги)' : 'Отметить шаг (закроет и предыдущие)'}
                        className={`mt-0.5 w-4 h-4 shrink-0 rounded-[3px] border grid place-items-center transition-colors ${stepDone ? 'bg-fir/20 border-fir text-fir' : 'border-line-2 text-transparent hover:border-brass hover:text-brass/60'}`}
                      >
                        <Check size={11} strokeWidth={3} />
                      </button>
                      <span className={`text-[12.5px] leading-snug ${stepDone ? 'text-ink-4 line-through' : 'text-ink-2'}`}><span className="num text-ink-4 mr-1">{i + 1}.</span>{step}</span>
                    </li>
                  )
                })}
              </ol>
            )}
            <div className="flex flex-col gap-2.5">
              {c.objectives.map((o) => (
                <ObjectiveCard key={o.gate} obj={o} done={!!storyDone[o.gate]} onToggle={() => {
                  toggleStory(o.gate)
                  toast(storyDone[o.gate] ? `Отметка снята: ${o.objective}` : `Цель пройдена: ${o.objective}`, storyDone[o.gate] ? 'info' : 'ok')
                }} />
              ))}
            </div>
            </>}
          </section>
        )
      })}
    </div>
  )
}

function ObjectiveCard({ obj, done, onToggle }: { obj: StoryObjective; done: boolean; onToggle: () => void }) {
  const questsDone = obj.quests.filter((q) => q.status === 'done').length
  // автоподсказка: все квесты за целью выполнены, а цель не отмечена — почти наверняка пройдена
  const suggestDone = !done && obj.quests.length > 0 && questsDone === obj.quests.length
  return (
    <div className={`rounded-[6px] border p-3 ${done ? 'border-fir/40 bg-fir/5' : 'border-line bg-bg-2'}`}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          title={done ? 'Снять отметку' : 'Отметить цель пройденной'}
          className={`w-6 h-6 shrink-0 rounded-[4px] border grid place-items-center transition-colors ${done ? 'bg-fir/20 border-fir text-fir' : 'border-line-2 text-transparent hover:border-brass hover:text-brass/60'}`}
        >
          <Check size={15} strokeWidth={3} />
        </button>
        <div className="flex-1 min-w-0">
          <div className={`display text-[15px] ${done ? 'text-ink-2 line-through' : 'text-ink'}`}>{OBJECTIVE_RU[obj.objective] ?? obj.objective}</div>
          <div className="text-[12px] text-ink-3 num">отпирает {obj.quests.length} квест{obj.quests.length > 1 ? (obj.quests.length < 5 ? 'а' : 'ов') : ''} · выполнено {questsDone}</div>
        </div>
        {suggestDone && (
          <span className="inline-flex items-center gap-1 text-[11px] text-brass-2" title="Все квесты за этой целью уже выполнены — скорее всего, цель пройдена, можно отметить">
            <Sparkles size={12} /> похоже, пройдена
          </span>
        )}
        <div className="w-28 shrink-0 hidden sm:block">
          <Progress value={obj.quests.length ? questsDone / obj.quests.length : 0} />
        </div>
      </div>
      <ul className="mt-2 ml-9 flex flex-col gap-1">
        {obj.quests.map((q) => (
          <li key={q.task.id} className="flex items-center gap-2 text-[12.5px]">
            <TraderMark id={q.task.trader} size={18} />
            <Link to={`/tasks?task=${q.task.id}`} className={`truncate hover:text-brass-2 ${q.status === 'done' ? 'text-ink-4 line-through' : q.status === 'available' ? 'text-ink' : 'text-ink-3'}`}>
              {q.task.name}
            </Link>
            {q.status === 'locked' && <Lock size={10} className="text-ink-4 shrink-0" />}
            {q.status === 'done' && <Check size={11} className="text-fir shrink-0" />}
            <span className="ml-auto text-[11px] text-ink-4 shrink-0">{q.task.minPlayerLevel > 0 ? `${q.task.minPlayerLevel} ур.` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
