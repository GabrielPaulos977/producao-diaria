export const BASES = [
  { id: "santa-rosa", nome: "Santa Rosa", sigla: "SR", adm: 10 },
  { id: "tres-passos", nome: "Três Passos", sigla: "TP", adm: 10 },
  { id: "frederico", nome: "Frederico Westphalen", sigla: "FW", adm: 10 },
];

export const INTEGRANTES_POR_TIPO = { "B3": 7, "B2": 4, "B1": 2, "C1": 2, "-": 0 };

export const EQUIPES_POR_BASE = {
  "santa-rosa": [
    {id:"eq1",nome:"SRO 5501",enc:"Paulo",tipo:"B3",meta:25},
    {id:"eq2",nome:"SRO 5363",enc:"Elemar",tipo:"B3",meta:25},
    {id:"eq3",nome:"SRO 5823",enc:"João",tipo:"B3",meta:25},
    {id:"eq4",nome:"SRO 5081",enc:"Vanderlei",tipo:"B3",meta:25},
    {id:"eq5",nome:"SRO 5658",enc:"Cleversson",tipo:"B3",meta:25},
    {id:"eq6",nome:"SRO 5838",enc:"Wagner",tipo:"B3",meta:25},
    {id:"eq7",nome:"SRO 5483",enc:"Darci",tipo:"B3",meta:25},
    {id:"eq8",nome:"SRO 5761",enc:"Eloi",tipo:"B3",meta:25},
    {id:"eq9",nome:"SRO 5414",enc:"Lucas",tipo:"B3",meta:25},
    {id:"eq10",nome:"SRO 5839",enc:"Sandro",tipo:"B3",meta:25},
    {id:"eq11",nome:"SRO 6143",enc:"Josias",tipo:"C1",meta:14},
    {id:"eq12",nome:"SRO 6252",enc:"Alexandre",tipo:"C1",meta:14},
    {id:"eq13",nome:"SRO 6254",enc:"Reserva",tipo:"C1",meta:14},
    {id:"eq14",nome:"SRO 7742",enc:"Reserva",tipo:"B1",meta:18},
    {id:"eq15",nome:"SRO 7744",enc:"Polidril",tipo:"B1",meta:104.55},
    {id:"eq16",nome:"SRO 7743",enc:"Gilberto",tipo:"B1",meta:18},
    {id:"eq17",nome:"SRO 7745",enc:"Reserva",tipo:"-",meta:0},
    {id:"eq18",nome:"SRO 5502",enc:"Rogério",tipo:"B1",meta:18},
  ],
  "frederico": [
    {id:"eq1",nome:"FWE 5082",enc:"Paulo",tipo:"B3",meta:25},
    {id:"eq2",nome:"FWE 5875",enc:"Adelar",tipo:"B3",meta:25},
    {id:"eq3",nome:"FWE 5893",enc:"Elcindo",tipo:"B3",meta:25},
    {id:"eq4",nome:"FWE 5889",enc:"Nelson",tipo:"B3",meta:25},
    {id:"eq5",nome:"FWE 5840",enc:"Diangro",tipo:"B3",meta:25},
    {id:"eq6",nome:"FWE 5697",enc:"Adejalmo",tipo:"B3",meta:25},
    {id:"eq7",nome:"FWE 5335",enc:"Vagner",tipo:"B3",meta:25},
    {id:"eq8",nome:"FWE 5837",enc:"Altair",tipo:"B3",meta:25},
    {id:"eq9",nome:"FWE 6015",enc:"Amauri",tipo:"C1",meta:14},
    {id:"eq10",nome:"FWE 6549",enc:"Itamar",tipo:"C1",meta:14},
    {id:"eq11",nome:"FWE 7737",enc:"Polidril",tipo:"B1",meta:104.55},
  ],
  "tres-passos": [
    {id:"eq1",nome:"TPA 5698",enc:"Alexandre",tipo:"B3",meta:25},
    {id:"eq2",nome:"TPA 5595",enc:"Tiago",tipo:"B2",meta:16.82},
    {id:"eq3",nome:"TPA 5699",enc:"Ivar",tipo:"B2",meta:16.82},
    {id:"eq4",nome:"TPA 5130",enc:"Ademir",tipo:"B3",meta:25},
    {id:"eq5",nome:"TPA 5883",enc:"Luis O",tipo:"B3",meta:25},
    {id:"eq6",nome:"TPA 5874",enc:"Laercio",tipo:"B3",meta:25},
    {id:"eq7",nome:"TPA 5843",enc:"Deonisio",tipo:"B3",meta:25},
    {id:"eq8",nome:"TPA 5762",enc:"Paulo",tipo:"B2",meta:16.82},
    {id:"eq9",nome:"TPA 6142",enc:"Eder LV",tipo:"C1",meta:14},
    {id:"eq10",nome:"TPA 6003",enc:"Luis LV",tipo:"C1",meta:14},
    {id:"eq11",nome:"TPA 7739",enc:"Giovani",tipo:"B1",meta:104.55},
    {id:"eq12",nome:"TPA 7741",enc:"Luis Prep",tipo:"B1",meta:18},
    {id:"eq13",nome:"TPA 7740",enc:"Dangre Prep",tipo:"B1",meta:18},
  ],
};

// Backward compatibility
export const EQUIPES = EQUIPES_POR_BASE["santa-rosa"];
export const INIT_NOTAS = [];

export const DIAS_UTEIS = 22;
export const DIVISOR_US = 222.67;

export const MOTIVOS_RETRAB = [
  "Calçadas RPS",
  "Calçadas RPE",
  "Poda de vegetação",
  "Estrutura fora de bissetriz",
  "Poste fora do prumo",
  "Recolhimento de resíduos",
  "Aterramento de cerca",
  "Luminária pública",
  "Estrutura diferente do projeto",
  "Tracionamento de cabos",
  "Placa com Nº Operativo",
  "Espaçadores losangulares ou verticais",
  "Ajustar Espaçadores losangulares",
  "Compactar cavas poste velho",
  "Não realizado serviço proposto no projeto",
  "Rede locada em local errado",
  "Cabos de telefone",
  "Outro",
];

export const SERVICOS_LISTA = [
  {d:"SUBSTITUIR POSTE, COM TRANSPORTE-13.1",v:959.83},
  {d:"SUBST.ESTR.PRIMÁRIA (COND. COMUM)-8.1",v:669.7},
  {d:"INSTALAR ESTRUT. PRIMÁRIA COMPACTA-15.1",v:216.76},
  {d:"INSTALAR POSTE, COM TRANSPORTE-13.1",v:753.34},
  {d:"CONCRETAR BASE-13.3",v:612.3},
  {d:"INST.ESTR.TRANSFORMADORA COM TRAFO-7.1",v:1548.45},
  {d:"TRACIONAR/ENCABEÇAR LANCE MENSAG.-15.7",v:111.62},
  {d:"ENCABECAR CABO REDE COMPACTA - 15.6",v:200.91},
  {d:"MANOBRAS CHAVES FUSIVEIS/FACA/TRIPOLARES",v:180.2},
  {d:"INST. CONECTOR/GRAMPO/QUALQUER TIPO-4.4",v:66.97},
  {d:"INSTALAR AMARRAÇÃO EM UM CONDUTOR-4.7",v:55.81},
  {d:"REINST.OCUPAÇÃO POSTE-13.10",v:200.91},
  {d:"REINSTALAR CONJUNTO I.P. COMPLETO-9.1",v:185.8},
  {d:"INSTALAR ESPAÇADOR REDE COMPACTA-15.3",v:49.55},
  {d:"INST. CONEXÃO EM CABO PROTEGIDO-15.5",v:105.28},
  {d:"ABRIR/FECHAR JUMPER TEMPOR/DEFINIT-4.5",v:133.94},
  {d:"INSTALAR ATÉ TRÊS PARA-RAIO-12.1",v:446.47},
  {d:"PODA DE ÁRVORE (SEM REMOÇÃO)-1.1",v:57.69},
  {d:"RETIRAR POSTE, COM TRANSPORTE-13.1",v:343.59},
  {d:"INSTALAR ESTRUT. ATERR. REDE/EQUIP.-2.2",v:613.9},
  {d:"INTERLIGAR CABOS AOS BORNES TRANFO-14.8",v:185.8},
  {d:"SERV INSTALAR ATERRAMENTO CERCA",v:126.09},
  {d:"QUEBRAR/REFAZER PASSEIO SIMPLES-13.6",v:150.15},
  {d:"REINSTALAR RAMAL LIGAÇÃO COMPLETO-11.1",v:50.27},
  {d:"TRACIONAR/ENCABEÇAR CABO MULTIPLEX-14.2",v:223.23},
  {d:"OUTRO (informar valor)",v:0},
];
