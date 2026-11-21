APP ?=
APPS := web api
PKG_PREFIX := midia_sbn_app-

ifneq ($(APP),)
ifeq ($(filter $(APP),$(APPS)),)
$(error APP inválido: "$(APP)". Use: $(APPS))
endif
endif

COMPOSE := docker compose

.DEFAULT_GOAL := help
.PHONY: help setup up down restart logs ps dev db-up db-migrate db-seed db-studio

help: ## Lista os comandos disponíveis
	@echo "Uso: make <comando> [APP=web|api]\n"
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-11s %s\n", $$1, $$2}'

setup:
	npm install
	@[ -f .env ] || { cp .env.template .env && echo "Criado .env (preencha as variáveis do Postgres)"; }
	@[ -f apps/api/.env ] || { cp apps/api/.env.example apps/api/.env && echo "Criado apps/api/.env (preencha DATABASE_URL e DIRECT_URL)"; }
	npm run db:generate

define check_service
	@$(if $(APP),$(COMPOSE) config --services 2>/dev/null | grep -qx "$(APP)" || \
		{ echo "Serviço \"$(APP)\" ainda não existe no docker-compose.yml"; exit 1; })
endef

up:
	$(check_service)
	$(COMPOSE) up -d --build $(APP)

down:
	$(check_service)
	$(if $(APP),$(COMPOSE) rm -sf $(APP),$(COMPOSE) down)

restart:
	$(check_service)
	$(COMPOSE) restart $(APP)

logs:
	$(check_service)
	$(COMPOSE) logs -f $(APP)

ps:
	$(COMPOSE) ps

dev:
	@if [ "$(APP)" != "web" ]; then $(MAKE) --no-print-directory db-up; fi
	npx turbo run dev $(if $(APP),--filter=$(PKG_PREFIX)$(APP))

db-up:
	$(COMPOSE) up -d db

db-migrate:
	npm run db:migrate -w apps/api

db-seed:
	npm run db:seed -w apps/api

db-studio:
	npm run db:studio -w apps/api
