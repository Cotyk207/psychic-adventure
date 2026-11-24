export const TOOL_META = {
  read_file: { label: 'Чтение файла', icon: 'file-text' },
  write_file: { label: 'Запись файла', icon: 'file-plus' },
  edit_file: { label: 'Правка файла', icon: 'file-pen' },
  list_directory: { label: 'Список файлов', icon: 'folder-open' },
  search_files: { label: 'Поиск по содержимому', icon: 'file-search' },
  find_files: { label: 'Поиск файлов', icon: 'search' },
  delete_path: { label: 'Удаление', icon: 'trash' },
  move_path: { label: 'Перемещение', icon: 'folder-input' },
  get_file_info: { label: 'Информация о файле', icon: 'info' },
  run_command: { label: 'Команда', icon: 'terminal' },
  web_search: { label: 'Поиск в интернете', icon: 'globe' },
  fetch_url: { label: 'Открыть страницу', icon: 'download' },
  browser_open: { label: 'Открыть в браузере', icon: 'app-window' },
  browser_read: { label: 'Прочитать страницу', icon: 'scan-text' },
  browser_eval: { label: 'JS в браузере', icon: 'code' },
  generate_image: { label: 'Генерация картинки', icon: 'image' },
  generate_music: { label: 'Генерация музыки', icon: 'music' },
  generate_video: { label: 'Генерация видео', icon: 'clapperboard' },
  play_music: { label: 'Включить музыку', icon: 'play' },
  save_memory: { label: 'Запомнить', icon: 'brain' },
  search_memory: { label: 'Поиск в памяти', icon: 'database' },
  screenshot: { label: 'Скриншот экрана', icon: 'monitor' },
  open_app: { label: 'Открыть приложение', icon: 'rocket' },
  clipboard_read: { label: 'Буфер обмена', icon: 'clipboard' },
  clipboard_write: { label: 'Записать в буфер', icon: 'clipboard-check' },
  ask_user: { label: 'Спросить пользователя', icon: 'message-circle-question' },
  install_skill: { label: 'Установить скилл', icon: 'sparkles' },
};

export function toolMeta(name) {
  return TOOL_META[name] || { label: name, icon: 'wrench' };
}
