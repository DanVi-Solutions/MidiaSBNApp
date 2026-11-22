APP ?=
APPS := web api
PKG_PREFIX := midia_sbn_app-

ifneq ($(APP),)
ifeq ($(filter $(APP),$(APPS)),)
$(error APP inválido: "$(APP)". Use: $(APPS))
endif
endif

COMPOSE_ENV_FILES := $(foreach f,.env apps/web/.env,$(if $(wildcard $(f)),--env-file $(f)))
COMPOSE := docker compose $(COMPOSE_ENV_FILES)

.DEFAULT_GOAL := help
.PHONY: help setup up down restart logs ps dev db-up db-migrate db-seed db-studio

help: ## Lista os comandos disponíveis
	@echo "Uso: make <comando> [APP=web|api]\n"
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-11s %s\n", $$1, $$2}'

setup: ### Instala dependências e cria arquivos de configuração
	npm install
	@[ -f .env ] || { cp .env.template .env && echo "Criado .env (preencha as variáveis do Postgres)"; }
	@[ -f apps/api/.env ] || { cp apps/api/.env.example apps/api/.env && echo "Criado apps/api/.env (preencha DATABASE_URL e DIRECT_URL)"; }
	@[ -f apps/web/.env ] || { cp apps/web/.env.example apps/web/.env && echo "Criado apps/web/.env (confira NEXT_PUBLIC_API_HOST)"; }
	npm run db:generate

define check_service
	@$(if $(APP),$(COMPOSE) config --services 2>/dev/null | grep -qx "$(APP)" || \
		{ echo "Serviço \"$(APP)\" ainda não existe no docker-compose.yml"; exit 1; })
endef

up: ### Inicia o serviço especificado APP=web|api (ou todos, se APP não for definido)
	$(check_service)
	$(COMPOSE) up -d --build $(APP)

down: ### Para o serviço especificado APP=web|api (ou todos, se APP não for definido)
	$(check_service)
	$(if $(APP),$(COMPOSE) rm -sf $(APP),$(COMPOSE) down)

restart: ### Reinicia o serviço especificado APP=web|api (ou todos, se APP não for definido)
	$(check_service)
	$(COMPOSE) restart $(APP)

logs: ### Exibe os logs do serviço especificado APP=web|api (ou todos, se APP não for definido)
	$(check_service)
	$(COMPOSE) logs -f $(APP)

ps: ### Lista os serviços em execução
	$(COMPOSE) ps

dev: ### Inicia o serviço especificado APP=web|api (ou todos, se APP não for definido) em modo de desenvolvimento
	@if [ "$(APP)" != "web" ]; then $(MAKE) --no-print-directory db-up; fi
	npx turbo run dev $(if $(APP),--filter=$(PKG_PREFIX)$(APP))

db-up: ### Inicia o banco de dados (Postgres) em um container Docker
	$(COMPOSE) up -d db

db-migrate: ### Executa as migrações do banco de dados (Postgres) no serviço API
	npm run db:migrate -w apps/api

db-seed: ### Executa o seed do banco de dados (Postgres) no serviço API
	npm run db:seed -w apps/api

db-studio: ### Inicia o Prisma Studio para o banco de dados (Postgres) no serviço API
	npm run db:studio -w apps/api
