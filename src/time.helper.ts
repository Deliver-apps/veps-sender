import { DateTime } from 'luxon';

// Zona horaria de Buenos Aires
const BA_TZ = 'America/Argentina/Buenos_Aires';

export function nowBA(): DateTime {
  return DateTime.now().setZone(BA_TZ);
}

export function formatBA(dt: DateTime | Date | string, fmt = 'yyyy-MM-dd HH:mm:ss'): string {
  let dateTime: DateTime;
  if (dt instanceof DateTime) {
    dateTime = dt;
  } else if (dt instanceof Date) {
    dateTime = DateTime.fromJSDate(dt).setZone(BA_TZ);
  } else {
    dateTime = DateTime.fromISO(dt).setZone(BA_TZ);
  }
  return dateTime.toFormat(fmt);
}

export function todayBA(): string {
  return nowBA().toFormat('yyyy-MM-dd');
}

export function isoBA(): string {
  return nowBA().toISO();
}

export function getMonthNameBA(dt?: DateTime | Date | string): string {
  const dateTime = dt ? formatBA(dt, 'LLLL') : nowBA().toFormat('LLLL');
  //month to spanish
  const monthsSpanish = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  const monthIndex = nowBA().month - 1; // Luxon months are 1-12
  return monthsSpanish[monthIndex];
}

export function parseBA(dateStr: string, fmt = 'yyyy-MM-dd HH:mm:ss'): DateTime {
  const dateTime = DateTime.fromFormat(dateStr, fmt, { zone: BA_TZ });
  return dateTime;
}

// Ejemplo de uso:
// const fecha = nowBA();
// console.log(formatBA(fecha));
// console.log(getMonthNameBA());
