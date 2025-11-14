# OpenCommerce Documentation

Welcome to the OpenCommerce comprehensive documentation suite. This directory contains all technical and product documentation for the omnichannel POS system.

---

## 📚 Documentation Index

### 1. Product Requirements Document (PRD)
**Location**: [`prd/PRODUCT_REQUIREMENTS.md`](prd/PRODUCT_REQUIREMENTS.md)

Complete product specifications including:
- Executive summary and problem statement
- User personas and user stories
- Functional and non-functional requirements
- Success metrics and KPIs
- Future roadmap

**Audience**: Product managers, stakeholders, developers

---

### 2. Architecture Documentation
**Location**: [`architecture/ARCHITECTURE.md`](architecture/ARCHITECTURE.md)

System architecture and design including:
- High-level architecture diagrams
- Technology stack
- Service layer architecture
- Database design (8 service schemas)
- Security architecture (PCI DSS compliance)
- Deployment architecture
- Scalability and performance considerations

**Audience**: Technical architects, developers, DevOps

---

### 3. API Documentation
**Location**: [`api/API_DOCUMENTATION.md`](api/API_DOCUMENTATION.md)

Complete REST API reference including:
- Authentication and authorization
- All API endpoints with request/response examples
- Error handling and status codes
- Webhook specifications (DoorDash, Uber Eats)
- Rate limiting
- Best practices

**Audience**: Frontend developers, integration partners, API consumers

---

### 4. Sequence Diagrams
**Location**: [`flows/SEQUENCE_DIAGRAMS.md`](flows/SEQUENCE_DIAGRAMS.md)

Visual flow diagrams for key processes:
1. In-Store POS Transaction Flow
2. DoorDash Order Flow
3. Uber Eats Order Flow
4. Elistar Product Sync Flow
5. Age Verification Flow
6. Manager Override Flow
7. Offline Sync Flow
8. Payment Processing Flow (Stripe Terminal)

**Format**: Mermaid diagrams (GitHub/Markdown compatible)

**Audience**: Developers, QA engineers, business analysts

---

### 5. End-to-End Data Flows
**Location**: [`flows/DATA_FLOWS.md`](flows/DATA_FLOWS.md)

Comprehensive data flow documentation:
- Product data flow (Elistar → OpenCommerce → Channels)
- Order data flow (multi-channel aggregation)
- Payment data flow (card and cash)
- Inventory data flow (real-time tracking)
- Analytics data flow (reporting pipeline)
- Audit and compliance data flow (PCI DSS)

**Audience**: Data architects, developers, compliance officers

---

### 6. UI Documentation
**Location**: [`ui/UI_DOCUMENTATION.md`](ui/UI_DOCUMENTATION.md)

Frontend component documentation:
- Page components (Login, POS Terminal, Order Queue, Back-Office)
- Shared components (Manager Override, etc.)
- State management (Zustand, React Query)
- Styling guide (TailwindCSS)
- Component API reference
- User workflows

**Audience**: Frontend developers, UI/UX designers

---

### 7. Gaps Analysis
**Location**: [`GAPS_ANALYSIS.md`](GAPS_ANALYSIS.md)

Current implementation status and gaps:
- Critical gaps (P0 - Must Fix)
- High priority gaps (P1 - Should Fix)
- Medium priority gaps (P2 - Nice to Have)
- Technical debt
- Risk assessment
- Recommendations and timeline

**Audience**: Project managers, developers, stakeholders

---

## 🎯 Quick Start Guides

### For Developers

1. **Getting Started**:
   - Read: [Architecture Documentation](architecture/ARCHITECTURE.md)
   - Setup: See main [`README.md`](../README.md)
   - APIs: [API Documentation](api/API_DOCUMENTATION.md)

2. **Understanding Flows**:
   - Visual: [Sequence Diagrams](flows/SEQUENCE_DIAGRAMS.md)
   - Data: [Data Flows](flows/DATA_FLOWS.md)

3. **Frontend Development**:
   - UI: [UI Documentation](ui/UI_DOCUMENTATION.md)
   - Components: See `ui/src/components/`

---

### For Product Managers

1. **Product Overview**:
   - Start: [PRD](prd/PRODUCT_REQUIREMENTS.md)
   - Status: [Gaps Analysis](GAPS_ANALYSIS.md)

2. **Understanding Features**:
   - User Stories: See PRD Section 7
   - Workflows: [Sequence Diagrams](flows/SEQUENCE_DIAGRAMS.md)

---

### For QA Engineers

1. **Test Planning**:
   - Requirements: [PRD](prd/PRODUCT_REQUIREMENTS.md)
   - Flows: [Sequence Diagrams](flows/SEQUENCE_DIAGRAMS.md)
   - APIs: [API Documentation](api/API_DOCUMENTATION.md)

2. **Test Scenarios**:
   - User Workflows: [UI Documentation](ui/UI_DOCUMENTATION.md#user-workflows)
   - Known Gaps: [Gaps Analysis](GAPS_ANALYSIS.md)

---

### For Compliance/Security

1. **Security Architecture**:
   - PCI DSS: [Architecture - Security](architecture/ARCHITECTURE.md#security-architecture)
   - Audit Logs: [Data Flows - Compliance](flows/DATA_FLOWS.md#audit--compliance-data-flow)

2. **Age Verification**:
   - Flow: [Sequence Diagrams - Age Verification](flows/SEQUENCE_DIAGRAMS.md#5-age-verification-flow)
   - Requirements: [PRD - Age Verification](prd/PRODUCT_REQUIREMENTS.md#fr-43-age-verification-for-alcohol)

---

## 📊 System Overview

### Key Statistics
- **Total Services**: 18 backend modules
- **Frontend Components**: 10 main components
- **Database Schemas**: 8 service-oriented schemas
- **SQL Migrations**: 14 files (2,173 lines)
- **API Endpoints**: 20+ REST endpoints
- **External Integrations**: 6 (DoorDash, Uber Eats, Website, Stripe, Elistar, Ollama)

### Completion Status
- **Overall**: ~75% complete
- **Core POS**: ~85%
- **Order Management**: ~90%
- **Back-Office**: ~75%
- **Reporting**: ~40%

See [Gaps Analysis](GAPS_ANALYSIS.md) for detailed breakdown.

---

## 🛠️ Technology Stack

### Backend
- Node.js 20+, TypeScript 5.3, Express.js
- PostgreSQL 16 (pgvector), Redis 7
- Ollama (AI semantic search)

### Frontend
- React 18, TypeScript, Vite
- TailwindCSS, React Query, Zustand

### Integrations
- Stripe Terminal (payments)
- DoorDash API, Uber Eats API
- Elistar NAXML (back-office sync)

### Infrastructure
- Docker Compose
- PM2 (process manager)

---

## 🔍 Search Guide

### By Topic

**Authentication & Security**:
- [API - Authentication](api/API_DOCUMENTATION.md#authentication)
- [Architecture - Security](architecture/ARCHITECTURE.md#security-architecture)
- [PRD - Auth Requirements](prd/PRODUCT_REQUIREMENTS.md#fr-1-user-authentication--authorization)

**Payment Processing**:
- [API - Payment](api/API_DOCUMENTATION.md#payment-processing)
- [Sequence - Payment Flow](flows/SEQUENCE_DIAGRAMS.md#8-payment-processing-flow)
- [Data Flow - Payment](flows/DATA_FLOWS.md#3-payment-data-flow)

**Order Management**:
- [API - Orders](api/API_DOCUMENTATION.md#order-management)
- [UI - Order Queue](ui/UI_DOCUMENTATION.md#3-order-queue-page-queue)
- [Data Flow - Orders](flows/DATA_FLOWS.md#2-order-data-flow)

**Inventory**:
- [Data Flow - Inventory](flows/DATA_FLOWS.md#4-inventory-data-flow)
- [PRD - Inventory Requirements](prd/PRODUCT_REQUIREMENTS.md#fr-5-inventory-management)

**Elistar Integration**:
- [API - Elistar](api/API_DOCUMENTATION.md#elistar-integration)
- [Sequence - Sync Flow](flows/SEQUENCE_DIAGRAMS.md#4-elistar-product-sync-flow)
- [Data Flow - Products](flows/DATA_FLOWS.md#1-product-data-flow)

---

## 📝 Documentation Standards

### Markdown Formatting
- Use GitHub-flavored markdown
- Include table of contents for long documents
- Use code blocks with language specification
- Include diagrams (Mermaid, ASCII, or links to images)

### Diagrams
- **Sequence Diagrams**: Mermaid format
- **Architecture Diagrams**: ASCII art or Mermaid
- **Data Flows**: ASCII diagrams with explanations

### Code Examples
- Always include language tag
- Show both request and response
- Include error handling examples
- Add comments for clarity

### Version Control
- Update "Last Updated" date on changes
- Increment version number for major updates
- Document breaking changes

---

## 🤝 Contributing to Documentation

### When to Update Docs

**Always update when**:
- Adding new API endpoints
- Changing database schema
- Adding new features
- Modifying user workflows
- Fixing critical bugs that affect behavior

**Where to update**:
1. **New API Endpoint** → `api/API_DOCUMENTATION.md`
2. **New Feature** → `prd/PRODUCT_REQUIREMENTS.md` + relevant docs
3. **UI Changes** → `ui/UI_DOCUMENTATION.md`
4. **Architecture Changes** → `architecture/ARCHITECTURE.md`
5. **New Integrations** → Multiple docs (API, Architecture, Data Flows)

### Documentation Review Process
1. Update relevant markdown files
2. Test all code examples
3. Verify diagrams render correctly
4. Update "Last Updated" date
5. Create PR with documentation changes
6. Request review from technical writer or lead developer

---

## 📞 Questions?

For questions about:
- **Product Requirements**: Contact Product Manager
- **Technical Architecture**: Contact Technical Lead
- **API Integration**: See [API Documentation](api/API_DOCUMENTATION.md) or contact Backend Team
- **UI/UX**: See [UI Documentation](ui/UI_DOCUMENTATION.md) or contact Frontend Team

---

## 📜 License

This documentation is part of the OpenCommerce project and is proprietary.

---

**Documentation Version**: 1.0
**Last Updated**: November 14, 2025
**Maintained By**: OpenCommerce Development Team
