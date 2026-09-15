import type { XYZ } from './types'

/**
 * Пункты квестов, у которых в tarkov.dev нет координат, но место известно из других записей тех же данных
 * (транзиты карт, зоны соседних квестов). Ключ — id пункта (objective).
 * Сверено 15.09.2026: кроме этих, без координат остались только пункты «Прокладка судна» на Ледоколе —
 * для них подложены картинки вики (см. OBJECTIVE_PICS).
 */
export const ZONE_FIXES: Record<string, { map: string; position: XYZ; note: string }> = {
  // «Под улицами» (Beneath The Streets): проход в Лабораторию — это транзит Streets → The Lab из данных карт
  '66aba85403e0ee3101042878': { map: '5714dc692459777137212e12', position: { x: 206.955, y: -8.382, z: 82.194 }, note: 'транзит в Лабораторию' },
  // «Загладить вину» (Make Amends, обе ветки): здание маяка — зона meh_50_visit_area_check_1 из «Знакомство» (Getting Acquainted)
  '63ab6a89e842787ad2135719': { map: '5704e4dad2720bb55b8b4567', position: { x: 442.23, y: 24.11, z: 460.69 }, note: 'зона из квеста «Знакомство»' },
}

/** Картинки вики для пунктов без координат (файлы File:…, CC BY-NC-SA). */
export const OBJECTIVE_PICS: Record<string, string[]> = {
  // «Прокладка судна» (Wiring the Vessel), Ледокол — на вики ремонт «у склада» и «под машинным» перепутаны местами (баг игры)
  '69e5593e3f425636f1d762d9': ['Wiring_the_Vessel_Leading_to_engine_Map.jpg', 'Wiring_the_Vessel_Leading_to_engine_Equipment.png'],
  '69e5594c6dd4d9e12fa3de0d': ['Peaceful_Atom_Automation_Room_Map.jpg', 'Peaceful_Atom_Automation_Room_Code_Room.png', 'Peaceful_Atom_Automation_Room_Code.png', 'Wiring_the_Vessel_Under_engine_Entry.png', 'Wiring_the_Vessel_Under_engine_Equipment.png'],
  '69e559525afcf4e746e98e33': ['Wiring_the_Vessel_Near_the_storage_Map.jpg', 'Wiring_the_Vessel_Near_the_storage_Equipment.png'],
  '69e559bf4b53b554a2779130': ['Peaceful_Atom_Control_Room_Map.jpg', 'Wiring_the_Vessel_Control_Room.png', 'Wiring_the_Vessel_Control_Room_Placement.png'],
}
