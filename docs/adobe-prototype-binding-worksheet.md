# Adobe prototype: step 17 binding worksheet

**Rendered:** 2026-09-21 from `fixtures/demo-forms/ingest/` in the application repository. Edit those files, not this document, then re-render.

## Approach

- The three PDFs are measured references only. Their form fields and text positions were inventoried locally; the inventories hold the original wording and stay out of git, Frame.io and Creative Cloud.
- Every image, logo and piece of copy is replaced. Layout, section structure and control positions follow the references, so each template keeps its own look.
- Fund facts become governed product data. Two synthetic brands apply to all three documents, giving six outputs.
- One shared field dictionary names every control, replacing the three naming schemes found in the references.

## Documents

| Document id | Title | Modelled on | Archetype | Pages | Source fields | Controls |
| --- | --- | --- | --- | --- | --- | --- |
| `consolidate-super` | Combine your super | `81122_consolidate_your_super.pdf` | form | 2 | 44 | 41 |
| `fund-nomination` | Nominate us as your super fund | `super-choice-fund-nomination-form.pdf` | short-guide | 3 | 27 | 14 |
| `update-details` | Update your account details | `change-of-details-form.pdf` | long-guide | 6 | 94 | 95 |

## Brands

| Brand id | Name | Role |
| --- | --- | --- |
| `example-super` | Example Super | primary brand; its values live in product-data.csv |
| `northwind-retirement` | Northwind Retirement | second brand; its values are brand pack overrides |

## Reusable components and where they are used

| Component | Purpose | Shape | consolidate-super | fund-nomination | update-details |
| --- | --- | --- | --- | --- | --- |
| `privacy.statement` | How personal information on a form is collected, used and protected, and where the privacy policy lives. | heading and two paragraphs | yes | yes | yes |
| `form.completion.instructions` | How to fill in a form: pen colour, block letters, mandatory field marker. | one short paragraph |  | yes | yes |
| `return.instructions` | How to send a completed form back and where to get help. | heading and paragraph; contact facts come from data | yes |  | yes |
| `tfn.notice` | Why a tax file number is requested, that giving it is voluntary, and how it is used. | one shaded paragraph | yes |  | yes |
| `bank.details.conditions` | Conditions on the bank account that payments can go to. | three paragraphs |  |  | yes |
| `compliance.letter.body` | Trustee confirmations that the fund can accept employer contributions, how to pay, and the help line. | salutation, lettered statements, two short sections |  | yes |  |
| `declaration.representative` | Declaration by a person signing on the member's behalf. | lead-in and bulleted statements |  |  | yes |
| `declaration.transfer` | Statements a member agrees to when asking to transfer a balance from another fund. | lead-in and bulleted statements | yes |  |  |
| `declaration.update` | Member declaration for a change of details, with the under-age note and signing note. | three short paragraphs |  |  | yes |
| `employer.records.instructions` | What the employer completes after receiving the form. | one paragraph |  | yes |  |
| `employer.retention.note` | How long the employer keeps the form and where it must not be sent. | one emphasised paragraph |  | yes |  |
| `guide.online.tip` | Details that can be changed online instead of by form. | sidebar heading and paragraph |  |  | yes |
| `guide.register.tip` | Invitation to register for online access. | sidebar heading and paragraph |  |  | yes |
| `guide.section.checklist` | Reminder to use the checklist, read the declaration and sign. | heading and paragraph |  |  | yes |
| `guide.section.contact` | What to enter in the new contact details section. | heading and paragraph |  |  | yes |
| `guide.section.current` | What to enter in the current details section. | heading and paragraph |  |  | yes |
| `guide.section.income` | Who completes the bank and payment sections. | heading and two paragraphs |  |  | yes |
| `guide.section.personal` | What to enter when a name, birth date or gender changes, and the evidence needed. | heading and paragraph |  |  | yes |
| `identity.document.option` | The certified-document alternative to electronic verification. | heading and paragraph |  |  | yes |
| `identity.electronic.explainer` | How electronic identity verification works and what it is used for. | heading and three paragraphs |  |  | yes |
| `identity.name.change.evidence` | Evidence required when personal details change. | one emphasised paragraph |  |  | yes |
| `income.account.explainer` | What a retirement income account is and which sections to skip without one. | heading and two paragraphs |  |  | yes |
| `income.payment.conditions` | Minimum payment rule and that changes apply from the next payment. | two paragraphs |  |  | yes |
| `income.payment.footnotes` | Footnotes explaining the minimum, maximum and blank-section behaviour. | small-print list |  |  | yes |
| `nomination.alternative` | What to do when the member wants to nominate a different fund. | one paragraph |  | yes |  |
| `nomination.intro` | Who the nomination form is for and that it goes to the employer, not the fund. | callout heading and paragraph |  | yes |  |
| `nomination.statement` | The member's nomination of the fund shown in the fund details panel. | one sentence |  | yes |  |

## Governed data and where it is used

| Data key | Type | Scope | Purpose | consolidate-super | fund-nomination | update-details |
| --- | --- | --- | --- | --- | --- | --- |
| `fund.name` | string | brand | Fund name in headings, panels and footers. | yes | yes | yes |
| `fund.abn` | string | brand | Fund ABN; clearly fictitious values. | yes | yes | yes |
| `fund.usi` | string | brand | Unique superannuation identifier. | yes | yes |  |
| `fund.spin` | string | brand | Legacy product identification number shown on the nomination form. |  | yes |  |
| `fund.address` | string | brand | Fund street address on one line. |  | yes |  |
| `trustee.name` | string | brand | Trustee legal name for issuer lines. | yes | yes | yes |
| `trustee.abn` | string | brand | Trustee ABN. | yes | yes | yes |
| `trustee.afsl` | string | brand | Trustee licence number. | yes | yes | yes |
| `trustee.rse` | string | brand | Trustee registrable superannuation entity licence. |  | yes |  |
| `contact.phone` | string | brand | Help line, using numbers reserved for fiction. | yes | yes | yes |
| `contact.hours` | string | shared | Help line opening hours; shared by both brands to show a shared data change. | yes |  | yes |
| `contact.website` | string | brand | Website on a reserved example domain. | yes | yes | yes |
| `contact.email` | string | brand | Forms mailbox on a reserved example domain. | yes |  | yes |
| `contact.postal.address` | string | brand | Return address block. | yes |  | yes |
| `contact.register.url` | string | brand | Online registration address. |  |  | yes |
| `contact.identity.url` | string | brand | Identity requirements fact sheet address. |  |  | yes |
| `letter.compliance.date` | date | shared | Date on the compliance letter. |  | yes |  |
| `letter.signatory.name` | string | brand | Fictional signatory of the compliance letter. |  | yes |  |
| `letter.signatory.title` | string | shared | Signatory's position. |  | yes |  |
| `form.issue.date` | date | shared | Issue date in footers. |  | yes |  |
| `form.consolidate.code` | string | shared | Form code and version for the transfer form. | yes |  |  |
| `form.nomination.code` | string | shared | Form code and version for the nomination form. |  | yes |  |
| `form.update.code` | string | shared | Form code and version for the change of details form. |  |  | yes |

Scope `brand` means the primary brand's value sits in the product data file and the second brand overrides it in its brand pack. Scope `shared` means one value serves both brands.

## Assets

| Asset | Scope | Purpose | consolidate-super | fund-nomination | update-details |
| --- | --- | --- | --- | --- | --- |
| `brand.logo` | brand | Abstract logo mark drawn for the prototype; the fund name beside it is live text from fund.name. | yes | yes | yes |
| `icon.online` | shared | Small marker for details that can be changed online. |  |  | yes |

## Normalisation decisions

- **Title** becomes one combo box from the dictionary in all three forms, replacing rows of tick boxes, radio buttons and a free-text box.
- **Dates** split into day, month and year boxes become single date fields with a format hint.
- **Exclusive choices** built from tick boxes become radio groups: gender, transfer amount, payment amount, payment frequency and card colour.
- **Gender** gains a third option, so three radio buttons appear where the references had two.
- **Signatures** become real signature fields; the references left blank boxes.
- **Character boxes** (comb fields) become plain fields that keep their maximum length. Comb formatting is an Acrobat property and is recorded as a finishing rule.
- **The fund's own identifiers** are printed from governed data instead of being pre-printed or typed by the member.
- **Inline facts inside sentences** are avoided: components never embed a fund name or number, so a component stays brand-neutral and facts sit in data targets.
- **Dropped:** two scripted buttons and one intentionally blank page.

## Demo scenarios this set supports

| Change | Expected rebuild |
| --- | --- |
| Edit `privacy.statement` in the content library | All six outputs |
| Edit `tfn.notice` | Four outputs; both `fund-nomination` outputs are skipped |
| Change shared `contact.hours` in the product data | Four outputs; `fund-nomination` skipped |
| Change `fund.spin` for the primary brand | One output: `fund-nomination` for that brand |
| Replace the second brand's logo | Three outputs, all for that brand |
| Restyle the `fund-nomination` template | Two outputs |
| Reference a draft component or an expired data value | Visible failure before InDesign is asked to compose |

## Fields: consolidate-super

| Tab | Page | Semantic name | Control | Req | Max | Description (tooltip) | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | `account.number` | text |  | 13 | Account number (if known) | p1#2 `Text1` |
| 2 | 1 | `customer.number` | text |  |  | Customer number (if known) | p1#1 `Text2` |
| 3 | 1 | `account.productName` | text |  |  | Product name | p1#3 `Text3` |
| 4 | 1 | `member.gender` | radio: Male | yes |  | Gender | p1#6 `Check Box1` |
| 5 | 1 | `member.gender` | radio: Female |  |  | Gender | p1#7 `Check Box1` |
| 6 | 1 | `member.gender` | radio: Another term |  |  | Gender | added |
| 7 | 1 | `member.title` | combo (7 options) |  |  | Title | p1#8 `Check Box2`, p1#9 `Check Box2`, p1#10 `Check Box2`, p1#11 `Check Box2`, p1#5 `Text5` |
| 8 | 1 | `member.firstName` | text | yes |  | First name | p1#12 `Text6.0` |
| 9 | 1 | `member.middleNames` | text |  |  | Middle name(s) | p1#13 `Text7.0` |
| 10 | 1 | `member.lastName` | text | yes |  | Last name | p1#14 `Text6.1` |
| 11 | 1 | `member.previousNames` | text |  |  | Previous names | p1#15 `Text7.1` |
| 12 | 1 | `member.email` | text |  |  | Email | p1#16 `Text6.2` |
| 13 | 1 | `member.phone.daytime` | text | yes | 10 | Daytime phone number | p1#17 `Text8.0` |
| 14 | 1 | `member.dateOfBirth` | text | yes |  | Date of birth (DD/MM/YYYY) | p1#18 `Text8.1` |
| 15 | 1 | `member.taxFileNumber` | text |  | 9 | Tax file number (TFN) | p1#19 `Text8.2` |
| 16 | 1 | `address.residential.unit` | text |  | 4 | Residential unit | p1#20 `Text9` |
| 17 | 1 | `address.residential.streetNumber` | text |  | 4 | Residential street number | p1#21 `Text9a` |
| 18 | 1 | `address.residential.streetName` | text | yes |  | Residential street name | p1#22 `Text9b` |
| 19 | 1 | `address.residential.suburb` | text | yes |  | Residential suburb or town | p1#23 `Text10` |
| 20 | 1 | `address.residential.state` | text | yes | 3 | Residential state | p1#24 `Text10a` |
| 21 | 1 | `address.residential.postcode` | text | yes | 4 | Residential postcode | p1#25 `Text10b` |
| 22 | 1 | `address.residential.country` | text |  |  | Residential country | p1#26 `Text10c` |
| 23 | 2 | `address.previous.unit` | text |  | 4 | Previous unit | p2#1 `Text11` |
| 24 | 2 | `address.previous.streetNumber` | text |  | 4 | Previous street number | p2#2 `Text11a` |
| 25 | 2 | `address.previous.streetName` | text |  |  | Previous street name | p2#3 `Text11b` |
| 26 | 2 | `address.previous.suburb` | text |  |  | Previous suburb or town | p2#4 `Text12` |
| 27 | 2 | `address.previous.state` | text |  | 3 | Previous state | p2#5 `Text12a` |
| 28 | 2 | `address.previous.postcode` | text |  | 4 | Previous postcode | p2#6 `Text12b` |
| 29 | 2 | `address.previous.country` | text |  |  | Previous country | p2#7 `Text12c` |
| 30 | 2 | `fromFund.name` | text | yes |  | Fund name | p2#8 `Text13.0.0` |
| 31 | 2 | `fromFund.productName` | text |  |  | Product name | p2#9 `Text13.0.1` |
| 32 | 2 | `fromFund.memberNumber` | text | yes | 13 | Member or account number | p2#10 `Text13.1.0` |
| 33 | 2 | `fromFund.usi` | text |  |  | Unique superannuation identifier (USI) | p2#11 `Text13.1.1` |
| 34 | 2 | `fromFund.esa` | text |  |  | Electronic service address (self-managed funds) | p2#12 `Text13.2.0` |
| 35 | 2 | `fromFund.abn` | text |  |  | Fund ABN (self-managed funds) | p2#13 `Text13.2.1` |
| 36 | 2 | `transfer.amountType` | radio: My whole balance | yes |  | Amount to transfer | p2#14 `Check Box3` |
| 37 | 2 | `transfer.amountType` | radio: Part of my balance |  |  | Amount to transfer | p2#16 `Check Box3` |
| 38 | 2 | `transfer.partialAmount` | text |  |  | Amount to transfer ($) | p2#15 `Text14` |
| 39 | 2 | `declaration.name` | text | yes |  | Full name (block letters) | p2#17 `Text15` |
| 40 | 2 | `declaration.signature` | signature | yes |  | Signature | added |
| 41 | 2 | `declaration.date` | text | yes |  | Date signed (DD/MM/YYYY) | p2#18 `Text16` |

Dropped from the reference:

- p1#4 Text4: The fund's own USI becomes governed data (fund.usi) printed in the template, not a member-entered field.

## Fields: fund-nomination

| Tab | Page | Semantic name | Control | Req | Max | Description (tooltip) | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | `member.title` | combo (7 options) |  |  | Title | p1#3 `Client1_Title`, p1#4 `Client1_Title`, p1#5 `Client1_Title`, p1#2 `Client1_Title`, p1#6 `Client1_Title`, p1#7 `Client1_Title`, p1#1 `Client1_Title_Other` |
| 2 | 1 | `member.lastName` | text | yes |  | Last name | p1#8 `Client1_Last_Name` |
| 3 | 1 | `member.firstName` | text | yes |  | First name | p1#9 `Client1_Given_Name` |
| 4 | 1 | `address.residential.line1` | text | yes |  | Residential street address | p1#10 `Client1_SCFN_Address_Street` |
| 5 | 1 | `address.residential.suburb` | text | yes |  | Residential suburb or town | p1#11 `Client1_SCFN_Address_Suburb` |
| 6 | 1 | `address.residential.state` | text | yes |  | Residential state | p1#13 `Client1_SCFN_Address_State` |
| 7 | 1 | `address.residential.postcode` | text | yes |  | Residential postcode | p1#12 `Client1_SCFN_Address_Postcode` |
| 8 | 1 | `member.dateOfBirth` | text | yes |  | Date of birth (DD/MM/YYYY) | p1#14 `Client1_DOB_Day`, p1#15 `Client1_DOB_Month`, p1#16 `Client1_DOB_Year` |
| 9 | 1 | `member.employeeId` | text |  |  | Employee or payroll number (if any) | p1#17 `Client1_SCFN_Employee_ID` |
| 10 | 1 | `member.number` | text |  |  | Member number | p1#18 `Client1_Member_Number` |
| 11 | 2 | `nomination.signature` | signature | yes |  | Signature | added |
| 12 | 2 | `nomination.date` | text | yes |  | Date signed (DD/MM/YYYY) | p2#1 `Client1_SCFN_Date_Signed_Day`, p2#2 `Client1_SCFN_Date_Signed_Month`, p2#3 `Client1_SCFN_Date_Signed_Year` |
| 13 | 2 | `employer.dateAccepted` | text |  |  | Date the nomination was accepted (DD/MM/YYYY) | p2#7 `Client1_SCFN_Employer_Date_Fund_Accepted_Day`, p2#8 `Client1_SCFN_Employer_Date_Fund_Accepted_Month`, p2#9 `Client1_SCFN_Employer_Date_Fund_Accepted_Year` |
| 14 | 2 | `employer.dateActioned` | text |  |  | Date the nomination was actioned (DD/MM/YYYY) | p2#4 `Client1_SCFN_Employer_Date_Executed_Day`, p2#5 `Client1_SCFN_Employer_Date_Executed_Month`, p2#6 `Client1_SCFN_Employer_Date_Executed_Year` |

## Fields: update-details

| Tab | Page | Semantic name | Control | Req | Max | Description (tooltip) | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2 | `member.number` | text |  |  | Member number | p3#1 `0` |
| 2 | 2 | `current.member.title` | combo (7 options) |  |  | Current title | p3#2 `1.1` |
| 3 | 2 | `current.member.firstName` | text | yes |  | Current first name | p3#3 `1.2` |
| 4 | 2 | `current.member.middleNames` | text |  |  | Current middle name(s) | p3#4 `1.3` |
| 5 | 2 | `current.member.lastName` | text | yes |  | Current last name | p3#5 `1.4` |
| 6 | 2 | `current.member.dateOfBirth` | text | yes |  | Current date of birth (DD/MM/YYYY) | p3#6 `1.5` |
| 7 | 2 | `current.member.gender` | radio: Male | yes |  | Current gender | p3#7 `1.6` |
| 8 | 2 | `current.member.gender` | radio: Female |  |  | Current gender | p3#8 `1.6` |
| 9 | 2 | `current.member.gender` | radio: Another term |  |  | Current gender | added |
| 10 | 2 | `current.address.residential.line1` | text | yes |  | Current Residential street address | p3#9 `1.7` |
| 11 | 2 | `current.address.residential.suburb` | text | yes |  | Current Residential suburb or town | p3#10 `1.8` |
| 12 | 2 | `current.address.residential.state` | text | yes |  | Current Residential state | p3#11 `1.9` |
| 13 | 2 | `current.address.residential.postcode` | text | yes |  | Current Residential postcode | p3#12 `1.10` |
| 14 | 2 | `current.address.postal.line1` | text |  |  | Current Postal street address | p3#13 `1.11` |
| 15 | 2 | `current.address.postal.suburb` | text |  |  | Current Postal suburb or town | p3#14 `1.12` |
| 16 | 2 | `current.address.postal.state` | text |  |  | Current Postal state | p3#15 `1.13` |
| 17 | 2 | `current.address.postal.postcode` | text |  |  | Current Postal postcode | p3#16 `1.14` |
| 18 | 2 | `current.member.phone.mobile` | text |  |  | Current mobile number | p3#17 `1.15` |
| 19 | 2 | `current.member.phone.daytime` | text |  |  | Current daytime phone number | p3#18 `1.16` |
| 20 | 2 | `current.member.email` | text | yes |  | Current email | p3#19 `1.17` |
| 21 | 2 | `change.account.accumulation` | checkbox |  |  | Accumulation account | p3#20 `1.18` |
| 22 | 2 | `change.account.employerPlan` | checkbox |  |  | Employer plan account | p3#21 `1.19` |
| 23 | 2 | `change.account.income` | checkbox |  |  | Retirement income account | p3#22 `1.20` |
| 24 | 2 | `change.account.businessPlan` | checkbox |  |  | Business plan account | p3#23 `1.21` |
| 25 | 3 | `new.address.residential.line1` | text |  |  | New Residential street address | p4#1 `2.1` |
| 26 | 3 | `new.address.residential.suburb` | text |  |  | New Residential suburb or town | p4#2 `2.2` |
| 27 | 3 | `new.address.residential.state` | text |  |  | New Residential state | p4#3 `2.3` |
| 28 | 3 | `new.address.residential.postcode` | text |  |  | New Residential postcode | p4#4 `2.4` |
| 29 | 3 | `new.address.postal.line1` | text |  |  | New Postal street address | p4#5 `2.5` |
| 30 | 3 | `new.address.postal.suburb` | text |  |  | New Postal suburb or town | p4#6 `2.6` |
| 31 | 3 | `new.address.postal.state` | text |  |  | New Postal state | p4#7 `2.7` |
| 32 | 3 | `new.address.postal.postcode` | text |  |  | New Postal postcode | p4#8 `2.8` |
| 33 | 3 | `new.member.phone.mobile` | text |  |  | New mobile number | p4#9 `2.9` |
| 34 | 3 | `new.member.phone.daytime` | text |  |  | New daytime phone number | p4#10 `2.10` |
| 35 | 3 | `new.member.email` | text |  |  | New email | p4#11 `2.11` |
| 36 | 3 | `new.member.title` | combo (7 options) |  |  | New title | p4#12 `3.1` |
| 37 | 3 | `new.member.firstName` | text |  |  | New first name | p4#13 `3.2` |
| 38 | 3 | `new.member.middleNames` | text |  |  | New middle name(s) | p4#14 `3.3` |
| 39 | 3 | `new.member.lastName` | text |  |  | New last name | p4#18 `3.4` |
| 40 | 3 | `new.member.dateOfBirth` | text |  |  | New date of birth (DD/MM/YYYY) | p4#15 `3.5` |
| 41 | 3 | `new.member.gender` | radio: Male |  |  | New gender | p4#16 `3.6` |
| 42 | 3 | `new.member.gender` | radio: Female |  |  | New gender | p4#17 `3.6` |
| 43 | 3 | `new.member.gender` | radio: Another term |  |  | New gender | added |
| 44 | 4 | `bank.primary.accountName` | text |  |  | Primary account account name | p5#1 `4.1` |
| 45 | 4 | `bank.primary.bsb` | text |  | 6 | Primary account BSB | p5#3 `4.2` |
| 46 | 4 | `bank.primary.accountNumber` | text |  | 10 | Primary account account number | p5#2 `4.3` |
| 47 | 4 | `bank.primary.institution` | text |  |  | Primary account financial institution | p5#4 `4.4` |
| 48 | 4 | `bank.secondary.accountName` | text |  |  | Secondary account account name | p5#5 `4.5` |
| 49 | 4 | `bank.secondary.bsb` | text |  | 6 | Secondary account BSB | p5#6 `4.6` |
| 50 | 4 | `bank.secondary.accountNumber` | text |  | 10 | Secondary account account number | p5#7 `4.7` |
| 51 | 4 | `bank.secondary.institution` | text |  |  | Secondary account financial institution | p5#8 `4.8` |
| 52 | 4 | `income.amountType` | radio: Minimum amount |  |  | Payment amount | p5#9 `5.1` |
| 53 | 4 | `income.amountType` | radio: A set amount per payment |  |  | Payment amount | p5#10 `5.2` |
| 54 | 4 | `income.specificAmount` | text |  |  | Amount per payment ($) | p5#11 `5.3` |
| 55 | 4 | `income.amountType` | radio: Maximum amount (transition to retirement) |  |  | Payment amount | p5#12 `5.4` |
| 56 | 4 | `income.amountType` | radio: Pro rata maximum (transition to retirement) |  |  | Payment amount | p5#13 `5.5` |
| 57 | 4 | `income.frequency` | radio: Fortnightly |  |  | Payment frequency | p5#14 `5.6` |
| 58 | 4 | `income.frequency` | radio: Monthly |  |  | Payment frequency | p5#15 `5.7` |
| 59 | 4 | `income.frequency` | radio: Quarterly |  |  | Payment frequency | p5#16 `5.8` |
| 60 | 4 | `income.frequency` | radio: Half yearly |  |  | Payment frequency | p5#17 `5.9` |
| 61 | 4 | `income.frequency` | radio: Yearly |  |  | Payment frequency | p5#18 `5.10` |
| 62 | 4 | `income.startDate` | text |  |  | Start payments from (DD/MM/YYYY) | p5#19 `5.11` |
| 63 | 5 | `identity.consentElectronic` | checkbox |  |  | I consent to electronic identity verification | p6#1 `6.1` |
| 64 | 5 | `identity.licence.fullName` | text |  |  | Full name as shown on driver licence | p6#2 `6.2` |
| 65 | 5 | `identity.licence.number` | text |  | 10 | Licence number | p6#4 `6.3` |
| 66 | 5 | `identity.licence.cardNumber` | text |  | 10 | Card number | p6#3 `6.4` |
| 67 | 5 | `identity.licence.state` | text |  | 3 | State of issue | p6#5 `6.5` |
| 68 | 5 | `identity.licence.expiry` | text |  |  | Licence expiry date (DD/MM/YYYY) | p6#6 `6.6` |
| 69 | 5 | `identity.passport.number` | text |  | 10 | Passport number | p6#7 `6.7` |
| 70 | 5 | `identity.passport.expiry` | text |  |  | Passport expiry date (DD/MM/YYYY) | p6#8 `6.8` |
| 71 | 5 | `identity.passport.fullName` | text |  |  | Full name as shown on passport | p6#9 `6.9` |
| 72 | 5 | `identity.passport.placeOfBirth` | text |  |  | Place of birth | p6#10 `6.10` |
| 73 | 5 | `identity.passport.countryOfBirth` | text |  |  | Country of birth | p6#11 `6.11` |
| 74 | 5 | `identity.passport.familyNameAtBirth` | text |  |  | Family name at birth | p6#12 `6.12` |
| 75 | 5 | `identity.medicare.fullName` | text |  |  | Full name as shown on Medicare card | p6#13 `6.13` |
| 76 | 5 | `identity.medicare.number` | text |  | 10 | Medicare number | p6#14 `6.14` |
| 77 | 5 | `identity.medicare.expiry` | text |  |  | Medicare card expiry (MM/YY) | p6#15 `6.15`, p6#16 `6.16` |
| 78 | 5 | `identity.medicare.referenceNumber` | text |  | 1 | Individual reference number | p6#17 `6.17` |
| 79 | 5 | `identity.medicare.cardColour` | radio: Green |  |  | Medicare card colour | p6#18 `6.18` |
| 80 | 5 | `identity.medicare.cardColour` | radio: Blue |  |  | Medicare card colour | p6#19 `6.19` |
| 81 | 5 | `identity.medicare.cardColour` | radio: Yellow |  |  | Medicare card colour | p6#20 `6.20` |
| 82 | 5 | `identity.documentBased` | checkbox |  |  | I will provide certified identity documents instead | p6#21 `6.21` |
| 83 | 6 | `checklist.readGuide` | checkbox |  |  | I have read the guide on page 1 | p7#1 `7.1` |
| 84 | 6 | `checklist.mandatoryComplete` | checkbox |  |  | I have completed every mandatory field | p7#2 `7.4` |
| 85 | 6 | `checklist.nameChanged` | checkbox |  |  | My name has changed and I have attached evidence | p7#3 `7.2` |
| 86 | 6 | `checklist.signingOnBehalf` | checkbox |  |  | I am signing on behalf of the member and have attached my authority | p7#4 `7.5` |
| 87 | 6 | `checklist.signedAndDated` | checkbox |  |  | I have signed and dated the form | p7#5 `7.6` |
| 88 | 6 | `checklist.identityCorrected` | checkbox |  |  | I am correcting my name, date of birth or gender and have attached identification | p7#6 `7.3` |
| 89 | 6 | `checklist.incomeChange` | checkbox |  |  | I have asked to change my income payments | p7#7 `7.7` |
| 90 | 6 | `declaration.name` | text | yes |  | Full name (block letters) | p7#8 `8.1` |
| 91 | 6 | `declaration.signature` | signature | yes |  | Signature | added |
| 92 | 6 | `declaration.date` | text | yes |  | Date signed (DD/MM/YYYY) | p7#9 `8.2` |
| 93 | 6 | `representative.name` | text |  |  | Representative's full name (block letters) | p7#10 `9.1` |
| 94 | 6 | `representative.signature` | signature |  |  | Representative's signature | added |
| 95 | 6 | `representative.date` | text |  |  | Date signed by representative (DD/MM/YYYY) | p7#11 `9.2` |

Dropped from the reference:

- p7#12 10.1, p7#13 10.2: Save and print buttons need Acrobat JavaScript actions, which are outside the prototype.
- source page 2: The intentionally blank page is removed; the rebuilt form has six pages.

## Limits to record

- Comb formatting, date validation and any calculation are Acrobat finishing rules, not InDesign output.
- Templates are generated from measured positions; decorative shapes are approximated, not traced.
- The references' fonts are not used. Templates use installed fonts so preflight stays clean.

## Approval

- [ ] Document ids, titles and archetype mapping
- [ ] Two brands applied to all three documents
- [ ] Component list and where-used matrix
- [ ] Data keys and scopes
- [ ] Normalisation decisions, including the combo title and single date fields
- [ ] Field names, required flags and tab order per document

