# 🚀 Guia Passo a Passo — Colocar o App no Ar

## Tempo estimado: 15-20 minutos

---

## PASSO 1: Criar conta no Firebase (banco de dados)

1. Acesse https://console.firebase.google.com/
2. Faça login com sua conta Google
3. Clique em **"Criar um projeto"**
4. Dê o nome: `producao-diaria`
5. Desative o Google Analytics (não precisa) → **Criar projeto**
6. No menu lateral, clique em **"Criação" → "Realtime Database"**
7. Clique em **"Criar banco de dados"**
8. Selecione a região mais próxima (us-central1 serve)
9. Selecione **"Iniciar no modo de teste"** → Ativar
10. ⚠️ **IMPORTANTE**: Copie a URL do banco que aparece no topo (algo como `https://producao-diaria-xxxxx-default-rtdb.firebaseio.com`)

### Pegar as credenciais:
1. No Firebase Console, clique na **engrenagem ⚙️** (canto superior esquerdo) → **"Configurações do projeto"**
2. Role até **"Seus apps"** e clique no ícone **</>** (Web)
3. Dê o apelido: `producao-web` → **Registrar app**
4. Vai aparecer um bloco de código com `firebaseConfig`. **Copie esses valores!**

Exemplo:
```
apiKey: "AIzaSyD..."
authDomain: "producao-diaria-xxxxx.firebaseapp.com"
databaseURL: "https://producao-diaria-xxxxx-default-rtdb.firebaseio.com"
projectId: "producao-diaria-xxxxx"
storageBucket: "producao-diaria-xxxxx.appspot.com"
messagingSenderId: "123456789"
appId: "1:123456789:web:abc123"
```

### Atualizar no código:
Abra o arquivo `src/firebase.js` e substitua os valores de `firebaseConfig` pelos seus.

---

## PASSO 2: Criar conta no Vercel (hospedagem gratuita)

1. Acesse https://vercel.com/
2. Clique em **"Sign Up"** → entre com sua conta GitHub (ou crie uma)
3. Se não tem GitHub:
   - Acesse https://github.com/ e crie uma conta gratuita
   - Depois volte ao Vercel e faça login com GitHub

---

## PASSO 3: Subir o código no GitHub

1. No GitHub, clique no **"+"** (canto superior direito) → **"New repository"**
2. Nome: `producao-diaria` → **Create repository**
3. Faça upload de todos os arquivos da pasta do projeto:
   - Clique em **"uploading an existing file"**
   - Arraste TODA a pasta do projeto
   - Clique em **"Commit changes"**

**Ou via terminal (se tiver Git instalado):**
```bash
cd producao-app
git init
git add .
git commit -m "primeiro deploy"
git remote add origin https://github.com/SEU_USUARIO/producao-diaria.git
git push -u origin main
```

---

## PASSO 4: Deploy no Vercel

1. No Vercel, clique em **"Add New" → "Project"**
2. Selecione o repositório `producao-diaria` do GitHub
3. O Vercel vai detectar automaticamente que é um projeto Vite/React
4. Clique em **"Deploy"**
5. Aguarde 1-2 minutos...
6. ✅ Pronto! Vai aparecer uma URL tipo: `https://producao-diaria-xxxx.vercel.app`

---

## PASSO 5: Compartilhar

- **Seu link**: `https://producao-diaria-xxxx.vercel.app`
- Envie este link para o auxiliar técnico
- Ele abre no celular, seleciona "Auxiliar Técnico" e já pode preencher
- Você abre o mesmo link, seleciona "Gestor" e monitora tudo

---

## 📋 Resumo da estrutura de acesso

| Perfil | O que pode fazer |
|--------|-----------------|
| **Auxiliar Técnico** | Atribuir pontos, marcar concluídos, registrar retrabalho, adicionar extras |
| **Gestor** | Ver painel, ranking, histórico, gráficos, importar Excel |

---

## ❓ Problemas comuns

**"Carregando dados..." e não aparece nada**
→ Verifique se as credenciais em `src/firebase.js` estão corretas

**"Permission denied" no Firebase**
→ No Firebase Console → Realtime Database → Regras, coloque:
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```
(Isso deixa aberto para qualquer um — ok para uso interno)

**Quero mudar o nome do site**
→ No Vercel → Settings → Domains → Adicione um domínio personalizado ou altere o subdomínio

---

## 🔄 Como atualizar o app depois

1. Faça as alterações nos arquivos
2. Suba para o GitHub (git push)
3. O Vercel faz deploy automático em 1 minuto!
