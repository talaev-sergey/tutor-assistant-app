export const ONLINE_PCS = [1, 2, 4, 6, 7, 10, 12];
export const PROTECTED_PCS = [1, 4, 7, 12];
export const TOTAL_PCS = 13;
export const HOST = '192.168.1.100';
export const VERSION = 'v1.0.0';

export interface Program {
  id: string;
  icon: string;
  name: string;
  desc: string;
}

export const PROGRAMS: Program[] = [
  { id: 'chrome', icon: '🌐', name: 'Google Chrome', desc: 'Браузер' },
  { id: 'word', icon: '📝', name: 'Microsoft Word', desc: 'Текстовый редактор' },
  { id: 'excel', icon: '📊', name: 'Microsoft Excel', desc: 'Таблицы' },
  { id: 'ppt', icon: '📑', name: 'PowerPoint', desc: 'Презентации' },
  { id: 'paint', icon: '🎨', name: 'Paint', desc: 'Графический редактор' },
  { id: 'calc', icon: '🧮', name: 'Калькулятор', desc: 'Стандартная утилита' },
  { id: 'notepad', icon: '🗒', name: 'Блокнот', desc: 'Текстовый файл' },
  { id: 'scratch', icon: '🐱', name: 'Scratch', desc: 'Визуальное программирование' },
  { id: 'vscode', icon: '💻', name: 'VS Code', desc: 'Редактор кода' },
  { id: 'figma', icon: '🎯', name: 'Figma', desc: 'Дизайн в браузере' },
];
