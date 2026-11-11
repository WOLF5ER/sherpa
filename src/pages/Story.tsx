import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Check, Lock, Sparkles } from 'lucide-react'
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
const CHAPTER_GUIDE: Record<string, { ru: string; how: string; main?: boolean; steps?: string[] }> = {
  'Tour': { ru: 'Тур', main: true, how: 'Вступительная глава — открывается после обучения. Знакомство с торговцами и доступ к картам.' },
  'Falling Skies': { ru: 'Падающие небеса', main: true, how: 'Найди упавший самолёт в Лесу. Первая глава с сюжетным выбором.', steps: [
    'Найди упавший самолёт в Лесу — рядом с лагерем Егеря, западнее выхода ZB-016',
    'Забери флешку с чёрного G-Wagon у тоннельного выхода на Берегу (платить Терапевту $2000 не обязательно)',
    'Дождись вестей от Прапора — тайм-гейт в несколько часов',
    'Забери бортовой самописец с обломков и спрячь его в хижине на острове у Берега',
    'Собери в рейде для Прапора: 2 набора инструментов, 3 аккумулятора, 5 печатных плат (ещё один тайм-гейт)',
    'Дом старосты (Берег, северо-запад болот): расшифровка переговоров экипажа под сломанной кроватью + флешка «Электроника» на угловом столике — отнеси Прапору',
    'Выбор: бронекейс из обломков — отдать Прапору (лучше, закроет концовку «Павший») или оставить себе (−0.3 репутации Прапора)',
  ] },
  'The Ticket': { ru: 'Билет', main: true, how: 'Открывается после «Падающих небес». Основная линия — ведёт к одной из четырёх концовок.', steps: [
    'После «Падающих небес» свяжется Керман (нужен Разведцентр 1 ур.)',
    'Кейс у Прапора: найди лагерь его людей на Маяке → задания Смотрителя (3 синих папки TerraGroup, жёлтая ракетница у ULTRA, 15 убийств за рейд). Кейс у тебя: найди экспериментальный глушитель сигнала в Лаборатории (блок изоляции / конференц-зал / лекционный зал)',
    'Вскрой кейс на верстаке (54 часа) — внутри RFID-карта Круглова и инструкции',
    'Выбор: работать с Керманом или идти своим путём',
    'Путь Кермана: мастер-карта в офисе Круглова (нужна чёрная ключ-карта) → устройство шифрования RFID (после провала поиска — 40 биткоинов Механику, ключ Электроника, квартира на ул. Климова 14А) → крафт активированной карты (50 ч)',
    'Помоги Керману с уликами: пройди все побочные главы + расшифровка разговора с г-жой А (Стриты, апартаменты «Кардинал», сейф в спальне)',
    'Финал Кермана: репутация Скупщика 4.0, кооп-выходы, БТР до «Цены независимости», солнечная энергия, крафт перепрограммированной карты',
    'Путь без Кермана — Прапор: 40 ремкомплектов, контейнер Gamma/Theta/Epsilon, 50 ед. военного снаряжения, чемодан на Резерве (ключ RB-PKPTS), $1 000 000 и 48 часов ожидания',
    'Путь без Кермана — Смотритель: 5 топографических карт (Завод, Центр, Таможня, Лес, Маяк), 30 ЧВК в Лесу, 100 жетонов, амулеты сектантов из всех маркированных комнат — на остров Маяка',
    'Выход на карту Терминал — рейд к концовке',
  ] },
  'Batya': { ru: 'Батя', how: 'Подбери нашивку «Богатырь» на Таможне: металлическое строение у электростанции южнее заправки.', steps: [
    'Разблокировка (любой вариант): Таможня — новый недострой базы сектантов, 2 этаж; Резерв — шар радарной станции; Берег — бункер севернее санатория; Лес — матрас на камне в лагере USEC',
    'Найди следы отряда спецназа BEAR и забери нашивку «Богатырь»',
    'Расспроси торговцев об отряде «Богатырь»',
    'Найди аванпост «Гнездо» и расследуй, что случилось с отрядом',
    'Найди место засады и телефон Моремана',
    'Прокачай Разведцентр до 3 уровня и свяжись с отрядом',
    'Получи доступ к Смотрителю и передай ему вещи отряда «Богатырь»',
    'Дождись, пока Воевода выйдет на связь (~24 часа), и докажи свою состоятельность',
    'Найди следы предателя, прижми Прапора и узнай, как сектанты связаны с генералом',
    'Поговори со Смотрителем и дождись его материалов о «Безымянных»',
    'Прочти отчёт о развёртывании агентурной сети',
    'Найди лагерь «Рябина»',
    'Собери личные дела бойцов отряда и узнай больше о Воеводе, Таране и Стрельце',
    'Добудь личную вещь Воеводы',
  ] },
  'Accidental Witness': { ru: 'Случайный свидетель', how: 'Осмотри разрисованные машины между общежитиями на Таможне.', steps: [
    'Разблокировка: белая машина со следами крови у трёхэтажной общаги на Таможне',
    'Узнай адрес Козлова и прочти записку на его двери (двухэтажная общага, комн. 110)',
    'Попади в комнату Козлова (нужен ключ от 110) и выясни, во что он влез',
    'Расспроси торговцев об Анастасии',
    'Проникни в квартиру подельника Лыжника, узнай о нём больше и прочти найденные документы',
    'Доложи Лыжнику и поговори с Барахольщиком',
    'Найди квартиру Анастасии, осмотри вход и узнай о ней больше',
    'Найди курьера Пашу и осмотри место нападения',
    'Поговори с Лыжником',
    'Найди тайник Решалы и осмотри его лачугу',
    'Найди убежище Козлова и добудь компромат на него',
  ] },
  'Blue Fire': { ru: 'Синее пламя', how: 'Прочти листовку МЧС в зелёном контейнере на военной базе в Лесу.', steps: [
    'Разблокировка (любой вариант): листовка МЧС — зелёный контейнер в лагере сектантов (медлагерь) в Лесу; палатки у выхода «Дорога вдоль реки» и у шоссе на Развязке; медзона МЧС на 1 этаже ULTRA',
    'Поговори с Механиком об ЭМИ-взрыве',
    'Найди фрагмент устройства — комната «Chek 13» или верхний уровень LexOS на Улицах Таркова',
    'Возьми у Механика хакерское устройство и установи его в серверной Лаборатории',
    'Выбор: продать фрагмент Механику или оставить «объект 1156» себе',
    'Ищи следы «объекта 1156» в офисах TerraGroup',
    'Осмотри отделение «Почты России» в центре города',
    'Найди фургон «Почты России» по логотипу',
  ] },
  'Boreas': { ru: 'Борей', how: 'Сигнал бедствия ведёт на замёрзший Ледокол — штурм надстройки и спасение капитана.' },
  'The Labyrinth': { ru: 'Лабиринт', how: 'Тоннель в подвале санатория на Берегу — туда ведёт цепочка Механика.', steps: [
    'Разблокировка: тоннель в подвале западного корпуса санатория на Берегу (нужен ключ от наружной двери)',
    'Спроси торговцев (Егеря) о подземном комплексе',
    'Дождись, пока Егерь соберёт ключ-карты (24–48 часов)',
    'Найди вход в подземный комплекс под санаторием и спустись внутрь',
    'Найди в Лабиринте следы отряда BEAR и их точку сбора у объекта 1156',
    'Найди командира отряда и собери больше сведений',
    'Попади в запертый офис (ключ у одного из шести учёных в белых халатах — возьми большой пустой рюкзак) и прослушай кассету',
    'Отнеси кассету Егерю; найди отчёт о разработке комплекса «Лабиринт» (сброшен в канализацию)',
  ] },
  'The Unheard': { ru: 'Неслышимый', how: 'Прочти записку об «Очищении» на первом этаже офисов TerraGroup на Улицах Таркова.', steps: [
    'Разблокировка (любой вариант): записка об «Очищении» — пост охраны TerraGroup на Улицах, офисы TerraGroup на Улицах или офис №4 в главном здании TerraGroup в Центре (нужен ключ учёного)',
    'Узнай больше о деятельности TerraGroup и добудь журнал перевозок катализатора (Завод)',
    'Найди служебную машину Ржевского и его личные вещи',
    'Расшифруй диск из машины Ржевского (12 часов)',
    'Найди исследования катализатора «Голубой лёд»',
    'Собери максимум сведений о программе «Безымянный»',
    'Узнай об «А.П.» и его роли; поищи его следы в Лаборатории (кабинет A / офис чёрной карты)',
    'Найди комнату А.П. в санатории (восточное крыло, 305), забери личные вещи и накопитель',
    'Взломай флешку А.П. (12 часов)',
    'Отдай Механику 5 000 000 ₽ и дождись вестей Электроники (3 часа)',
    'Перезапиши техдокументацию с флешки А.П. на носитель TerraGroup',
    'Проникни в квартиру А.П. (нужна скрафченная в Разведцентре зелёная карта), найди потайную комнату и изучи роль «Голубого льда» в протоколе «Безымянного»',
  ] },
  'They Are Already Here': { ru: 'Они уже здесь', how: 'Записка об «Оке мира»: добывается с сектанта, в общаге 314 на Таможне или в круге сектантов у Заброшенной деревни в Лесу.', steps: [
    'Разблокировка (любой вариант): «комнаты пыток» сектантов — общага на Таможне, RB-BK / RB-PKPM / RB-VO на Резерве, круг в Заброшенной деревне в Лесу, дом на острове сектантов на Берегу — или убийство сектанта',
    'Узнай о тех, кто оставляет странные знаки по всему Таркову, и найди место, связанное с «Оком мира»',
    'Найди квартиру жертвы культа и книгу, спрятанную рядом с Игорем',
    'Осмотри квартиру жертвы и найди первую кассету',
    'Спроси Механика об «Оке мира»',
    'Найди и убей 2 жрецов культа',
    'Найди отметки «Ока мира» на Маяке, в Лесу (дом сектантов) и на Берегу',
    'Осмотри район вышки Sordi (Берег) и почини её — труп со запиской, набор инструментов',
    'Узнай у Механика про станцию «14-4 КОРД» и восстанови ключ-карту Аршавина',
    'Проникни на секретный объект NGO Cobalt (электростанция на Развязке), восстанови питание и включи охлаждение в серверной',
    'Вставь флешку и скачай данные, забери её и отдай Механику',
    'До конца осмотри станцию ARRS 14-4 (инструкция на столе, кнопка в серверной, флешка на сервере), отсоедини её от внешнего агента и прочти спецификацию из письма Механика',
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
        return (
          <section key={c.name} className="panel p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <BookOpen size={15} className={guide?.main ? 'text-brass-2' : 'text-ink-3'} />
              <h2 className="display text-[20px] text-ink">{guide?.ru ?? CHAPTER_RU[c.name] ?? c.name}</h2>
              <span className="text-[12px] text-ink-4">{c.name}</span>
              {guide?.main
                ? <span className="display text-[10px] text-brass border border-brass-3 rounded-[3px] px-1 leading-[14px]" title="Обязательна для основной концовки">Основная</span>
                : <span className="display text-[10px] text-ink-3 border border-line-2 rounded-[3px] px-1 leading-[14px]" title="Необязательная глава — нужна для «лучшей» концовки">Побочная</span>}
              {c.objectives.length > 0 && <span className="ml-auto num text-[12px] text-ink-3">{gatesDone}/{c.objectives.length} целей</span>}
              {guide?.steps && <span className={`${c.objectives.length > 0 ? '' : 'ml-auto '}num text-[12px] ${stepsDone === guide.steps.length ? 'text-fir' : 'text-ink-3'}`}>{stepsDone}/{guide.steps.length} шагов</span>}
            </div>
            {guide && <p className="text-[13px] text-ink-3 leading-snug">{guide.how}</p>}
            {guide?.steps && (
              <ol className="flex flex-col gap-1">
                {guide.steps.map((step, i) => {
                  const key = `step:${c.name}:${i}`
                  const stepDone = !!storyDone[key]
                  return (
                    <li key={key} className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => toggleStory(key)}
                        title={stepDone ? 'Снять отметку' : 'Отметить шаг пройденным'}
                        className={`mt-0.5 w-4 h-4 shrink-0 rounded-[3px] border grid place-items-center transition-colors ${stepDone ? 'bg-fir/20 border-fir text-fir' : 'border-line-2 text-transparent hover:border-brass hover:text-brass/60'}`}
                      >
                        <Check size={11} strokeWidth={3} />
                      </button>
                      <span className={`text-[12.5px] leading-snug ${stepDone ? 'text-ink-4 line-through' : 'text-ink-2'}`}>{step}</span>
                    </li>
                  )
                })}
              </ol>
            )}
            {c.objectives.length === 0 && (
              <button
                type="button"
                onClick={() => { toggleStory(chapterKey); toast(chapterDone ? `Отметка снята: ${guide?.ru ?? c.name}` : `Глава пройдена: ${guide?.ru ?? c.name}`, chapterDone ? 'info' : 'ok') }}
                className={`self-start inline-flex items-center gap-2 rounded-[5px] border px-2.5 py-1.5 text-[12px] display transition-colors ${chapterDone ? 'border-fir/60 bg-fir/10 text-fir' : 'border-line-2 text-ink-3 hover:border-brass hover:text-brass-2'}`}
              >
                <Check size={13} strokeWidth={3} /> {chapterDone ? 'Глава пройдена' : 'Отметить главу пройденной'}
              </button>
            )}
            <div className="flex flex-col gap-2.5">
              {c.objectives.map((o) => (
                <ObjectiveCard key={o.gate} obj={o} done={!!storyDone[o.gate]} onToggle={() => {
                  toggleStory(o.gate)
                  toast(storyDone[o.gate] ? `Отметка снята: ${o.objective}` : `Цель пройдена: ${o.objective}`, storyDone[o.gate] ? 'info' : 'ok')
                }} />
              ))}
            </div>
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
