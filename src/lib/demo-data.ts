/** Presentation descriptors only. Business values are supplied by workspace-scoped database queries. */
export const metrics=[
  {label:"Диалоги",value:"0",delta:"Фактические данные",points:[0,0,0,0,0,0,0]},
  {label:"Новые лиды",value:"0",delta:"Фактические данные",points:[0,0,0,0,0,0,0]},
  {label:"Записи",value:"0",delta:"Фактические данные",points:[0,0,0,0,0,0,0]},
  {label:"Передано человеку",value:"0",delta:"Фактические данные",points:[0,0,0,0,0,0,0]},
];
export const activity:Array<{title:string;text:string;time:string;attention?:boolean}>=[];
export const conversations:Array<{name:string;initials:string;message:string;time:string;unread?:number}>=[];
