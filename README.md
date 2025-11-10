# projeto_aws
# Projeto Faculdade — CRUD **Movies** na AWS (API Gateway + EC2 Docker + RDS MySQL + Lambda `/report`)

> **Objetivo**: Demonstrar uma arquitetura mínima na AWS com **API REST** containerizada (EC2 + Docker), **banco MySQL no RDS**, **API Gateway** como _entrypoint_ HTTP, e **Lambda** para o endpoint `/report` que consome a própria API e retorna estatísticas.

## 🔎 Visão Geral
- **Domínio**: catálogo de filmes (entidade principal: `Movie`).
- **CRUD**: `GET /health`, `POST /movies`, `GET /movies`, `GET /movies/:id`, `PUT /movies/:id`, `DELETE /movies/:id`.
- **Report** (`/report` via Lambda): soma total de filmes, média de rating e top 3 gêneros.
- **Foco da avaliação**: configuração e integração dos serviços AWS.

## 🏗️ Arquitetura (Mermaid)
```mermaid
flowchart LR
  Client[(Cliente / Navegador)]
  APIGW[API Gateway (HTTP API)]
  EC2[EC2 + Docker<br/>Node.js API]
  RDS[(Amazon RDS MySQL)]
  LAMBDA[Lambda /report]

  Client -->|HTTPS 443| APIGW
  APIGW -->|ANY /{proxy+}<br/>HTTP proxy| EC2
  EC2 -->|JDBC/MySQL 3306| RDS
  APIGW -->|/report| LAMBDA
  LAMBDA -->|HTTP GET /movies| APIGW
```

## 🧩 Componentes
| Serviço | Função | Pontos-chave |
|---|---|---|
| **API Gateway (HTTP)** | Entrada pública | Rota `ANY /{proxy+}` → Integração **HTTP** `http://<EC2_DNS>:3000/{proxy}`; Stage `$default` com **Auto-deploy** |
| **EC2 + Docker** | Hospeda API Node/Express | Container expõe `3000` com `-p 3000:3000`; usa variáveis de ambiente p/ conectar no RDS |
| **RDS MySQL** | Banco de dados | Instância em subnet privada; SG do RDS permite `3306` **apenas** do SG da EC2 |
| **Lambda `/report`** | Estatísticas | **Não** acessa RDS; consome `GET ${API_BASE}/movies` via Gateway e agrega |

## 🔐 Variáveis de ambiente da API (exemplo `.env`)
```
MYSQL_HOST=tudo.cluster-custom-creuwgkcofr6.sa-east-1.rds.amazonaws.com
MYSQL_PORT=3306
MYSQL_USER=admin
MYSQL_PASSWORD=123456789
MYSQL_DATABASE=movies
PORT=3000
```

> Em produção, **não** versone credenciais. Prefira **Secrets Manager** e roles IAM.

## 🚀 Passo a passo resumido de deploy
1. **EC2 + Docker**
   - Copie o código (Node/Express) e `Dockerfile`.
   - `docker build -t movies-api:latest .`
   - `docker run -d --name movies-api --restart=always -p 3000:3000 --env-file .env movies-api:latest`
   - Teste local: `curl http://127.0.0.1:3000/health` (200 OK).

2. **RDS MySQL**
   - Anote o **Endpoint** e libere `3306` do **SG da EC2** (não 0.0.0.0/0).
   - Teste da EC2: `nc -zv <endpoint> 3306` e `mysql -h <endpoint> ... -e "SELECT NOW()"`.

3. **API Gateway (HTTP API)**
   - Integração **HTTP**: `http://<EC2_DNS>:3000/{proxy}`.
   - Rota: `ANY /{proxy+}` → integração HTTP.
   - Stage: `$default` com **Auto-deploy**.
   - **Invoke URL**: `https://<API_ID>.execute-api.sa-east-1.amazonaws.com`

4. **Lambda `/report`**
   - Runtime **Node.js 20**; handler `index.handler`.
   - Variável `API_BASE=https://<API_ID>.execute-api.sa-east-1.amazonaws.com`.
   - Integração no API Gateway: rota `ANY /report` → **Lambda** (autorize a permissão).

## 🧪 Testes (rápidos)
```bash
API="https://<API_ID>.execute-api.sa-east-1.amazonaws.com"
curl -s "$API/health"
curl -s -X POST "$API/movies" -H 'content-type: application/json' \
  -d '{"title":"Matrix","genre":"Sci-Fi","year":1999,"rating":9.0}'
curl -s "$API/movies"
curl -s "$API/report"
```

## 🧰 Script E2E (incluído neste repositório)
Arquivo: `e2e_full_test_with_seed.py`  
Funções:
- valida `/health` via Gateway;
- faz **seed** (N registros);
- testa `GET/POST/PUT/DELETE`;
- chama `/report` e confere retorno;
- (opcional) `--cleanup` para remover os criados.

**Uso**
```bash
pip install requests
python e2e_full_test_with_seed.py \
  --base https://<API_ID>.execute-api.sa-east-1.amazonaws.com \
  --seed 5 --cleanup
```

## 🧯 Troubleshooting
| Sintoma | Causa | Ação |
|---|---|---|
| **502/504** no Gateway | Integração HTTP incorreta ou porta 3000 bloqueada | `ANY /{proxy+}` → `http://<EC2_DNS>:3000/{proxy}`; SG EC2 com TCP/3000 aberto; container `-p 3000:3000` |
| **500** no POST `/movies` | Credenciais/endpoint do RDS incorretos | Verifique `.env`; teste `mysql` na EC2; abra 3306 do RDS para SG da EC2 |
| **/report 403** | Falta permissão para invocar a Lambda | Recrie integração e **autorize**; ou `lambda add-permission` |
| **/report 504** | Lambda não alcança o Gateway | Cheque `API_BASE`, responda `/health` e aumente timeout da Lambda |

## 🔐 Observações de segurança (produção)
- EC2 e RDS em **subnets privadas**; acesso público via **NLB + VPC Link** (HTTP API).
- Credenciais no **Secrets Manager**; rotacionar senhas.
- IAM com **least privilege**; CloudWatch Logs + Alarms.
- WAF no API Gateway (opcional), CORS restrito.

## 📎 Apêndice — comandos úteis
```bash
# EC2
sudo docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
curl -s http://127.0.0.1:3000/health

# Gateway (PowerShell)
$API="https://<API_ID>.execute-api.sa-east-1.amazonaws.com"
curl.exe -sv "$API/health"
```

---

### Créditos
Projeto desenvolvido para trabalho acadêmico, por Lucas Matos.
