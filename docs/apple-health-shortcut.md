# Apple Health to training app: iPhone Shortcut guide

This guide builds an iPhone Shortcut that reads today's and yesterday's nutrition totals from Apple Health
(where Cronometer writes them) and sends them to the app. Nothing here needs coding. Budget about 45 minutes the
first time; the steps repeat once per nutrient.

Placeholders used below:

- `<app URL>`: the address of the app, for example `https://your-app.example.com` (no trailing slash).
- `<your token>`: the ingest token from the app's Settings, Nutrition page (tap Reveal). Never share it or commit it.

## What the app expects

The app accepts a POST to `<app URL>/api/ingest/health` with a JSON body like this (invented numbers):

```json
{
  "sentAt": "2026-01-15T19:00:00-06:00",
  "days": [
    { "date": "2026-01-15", "totals": { "energy_kcal": 2100, "protein_g": 120, "water_ml": 1800 } },
    { "date": "2026-01-14", "totals": { "energy_kcal": 2650, "protein_g": 150, "water_ml": 2400 } }
  ]
}
```

- `sentAt` is the moment the Shortcut ran, as an ISO 8601 date with a time zone.
- `days` holds one entry per calendar day (at most 3): today and yesterday.
- Each day's totals REPLACE what the app had for that day. They are never added together, so sending the same day many
  times is fine. The newest `sentAt` wins.
- Keys the app does not know are ignored. Values must be plain numbers in the units in the table below.

## Part 1: Set up Cronometer

1. Open Cronometer, then Settings, then Apple Health.
2. Turn on writing (export) for nutrients and for water. Allow each nutrient type you want in the table below when
   iOS asks.
3. Turn off Cronometer's exercise or activity calorie adjustment (the setting that raises your calorie target when you
   exercise), or simply ignore Cronometer's targets. This app is the source of your targets; Cronometer is only the
   food diary.
4. Log a test item (for example a glass of water), then open the Health app, Browse, Nutrition, and confirm the entry
   appears under the source Cronometer.

## Part 2: The nutrient list

You will build one "block" of three actions per row. `Health type` is the best-known name in the Health app; the
**Key** is what the app expects in the JSON. Every Health type name here is **best-known, not guaranteed**: Apple
publishes no official list, so check each against the picker (see Troubleshooting).

| Nutrient | Health type (best-known) | Key | Unit the app expects |
| --- | --- | --- | --- |
| Calories | `Dietary Energy` | `energy_kcal` | kcal |
| Protein | `Protein` | `protein_g` | g |
| Carbohydrates | `Carbohydrates` | `carbs_g` | g |
| Fat | `Total Fat` | `fat_g` | g |
| Fiber | `Fiber` | `fiber_g` | g |
| Water | `Water` | `water_ml` | ml |
| Calcium | `Calcium` | `calcium_mg` | mg |
| Iron | `Iron` | `iron_mg` | mg |
| Magnesium | `Magnesium` | `magnesium_mg` | mg |
| Potassium | `Potassium` | `potassium_mg` | mg |
| Sodium | `Sodium` | `sodium_mg` | mg |
| Zinc | `Zinc` | `zinc_mg` | mg |
| Vitamin A | `Vitamin A` | `vitamin_a_ug` | ug (micrograms) |
| Vitamin C | `Vitamin C` | `vitamin_c_mg` | mg |
| Vitamin D | `Vitamin D` | `vitamin_d_ug` | ug (micrograms) |
| Vitamin E | `Vitamin E` | `vitamin_e_mg` | mg |
| Vitamin K | `Vitamin K` | `vitamin_k_ug` | ug (micrograms) |
| Vitamin B12 | `Vitamin B12` | `vitamin_b12_ug` | ug (micrograms) |
| Folate | `Folate` | `folate_ug` | ug (micrograms) |

Tip: build the first nutrient (Calories) completely and test it (Part 5) before repeating for the rest. You can start
with only the six macro/water rows and add micronutrients later; missing keys are fine.

## Part 3: Build the Shortcut

Open the Shortcuts app, tap the **+** button (top right) to create a new Shortcut, and tap its name at the top to
rename it, for example "Send nutrition". To add an action, tap **Add Action**, or the search bar at the bottom, then
type the action's name and tap it. Tap a blue word inside an action to change it.

### 3a. Today

1. Add **Dictionary**. Leave it empty. It will collect today's totals.
2. Add **Set Variable**. Name the variable `today` and set it to the Dictionary from step 1.
3. Add **Current Date**.
4. Add **Format Date**. Set Date Format to **Custom** and the format string to `yyyy-MM-dd`. Add **Set Variable**
   named `todayDate`.
5. **For the first nutrient (Calories):** add **Find Health Samples**.
   1. Tap **Add Filter**. Choose **Type**, then tap the value and choose the Health type (`Dietary Energy`).
   2. Tap **Add Filter** again. Choose **Start Date**, set the operator to **is today**.
   3. Leave Sort and Limit alone (turn Limit off if it is on).
6. Add **Calculate Statistics**. Set the statistic to **Sum**. Its input is "Health Samples" from step 5.
7. Add **Set Dictionary Value**. Set Key to the nutrient key (`energy_kcal`), Value to the **Statistics** result from
   step 6, and Dictionary to the `today` variable.
8. Repeat steps 5 to 7 for every row of the table in Part 2, changing the Health type in the filter and the Key in
   Set Dictionary Value each time. Tip: long-press a finished three-action block's first action and choose Duplicate
   for each of the three, or copy and paste the actions, then change the two values.
9. Check units. After Calculate Statistics, the number carries a unit (for example kcal, g, mL, mg, mcg). The app
   needs the units in the table. For Water, if Health uses fluid ounces, add **Convert Measurement** after Calculate
   Statistics and convert to **milliliters**, then use that result in Set Dictionary Value. Do the same for any
   nutrient whose unit differs from the table (for example kilojoules to kilocalories).
10. If a nutrient has no samples today, Calculate Statistics returns 0 or nothing. The app accepts a missing key.
    A zero is stored as zero, so for nutrients you do not track you may leave that block out entirely.

### 3b. Yesterday (second pass)

Yesterday is re-sent so that late edits in Cronometer are synced.

11. Add **Dictionary** (empty), then **Set Variable** named `yesterday`.
12. Add **Adjust Date**: Date = **Current Date**, Subtract **1 day**. Then **Format Date** (Custom `yyyy-MM-dd`) and
    **Set Variable** named `yesterdayDate`.
13. Repeat the block of three (Find Health Samples, Calculate Statistics, Set Dictionary Value) for every nutrient, but
    in Find Health Samples set the **Start Date** filter to **is between**, with the start `Yesterday at 00:00` and the
    end `Today at 00:00`. (If your Shortcuts offers "is yesterday" for the date operator, you can use that instead.)
    In Set Dictionary Value, use the `yesterday` variable as the Dictionary.

### 3c. Build the payload

14. Add **Dictionary**. Tap **Add new item** twice:
    - Type Text, Key `date`, Value the `todayDate` variable.
    - Type Dictionary, Key `totals`, Value the `today` variable.
    Then add **Set Variable** named `todayDay`.
15. Add another **Dictionary** with the same two items using `yesterdayDate` and the `yesterday` variable. Add
    **Set Variable** named `yesterdayDay`.
16. Add **Current Date**, then **Format Date** with Date Format **ISO 8601** (leave "Include time" on, so it
    includes the time zone offset). Add **Set Variable** `sentAt`.
17. Add a final **Dictionary** (this is the payload). Items:
    - Text, Key `sentAt`, Value the `sentAt` variable.
    - Array (list), Key `days`, with two items: the `todayDay` variable and the `yesterdayDay` variable.
    Name it by adding **Set Variable** `payload`.

### 3d. Send it

18. Add **Get Contents of URL**. Tap the URL field and enter `<app URL>/api/ingest/health`.
19. Tap **Show More**, then:
    - **Method**: POST.
    - **Headers**: Add new header. Key `Authorization`, Value `Bearer <your token>` (the word Bearer, a space, then the
      token). Add another header: Key `Content-Type`, Value `application/json`.
    - **Request Body**: JSON. Add two fields to match step 17: a Text field `sentAt` (value: the `sentAt`
      variable) and an Array field `days` (items: `todayDay` and `yesterdayDay`).
20. Optional but handy: add **Show Result** (or **Show Notification**) at the end to see the app's reply while testing,
    and remove it before scheduling. A successful reply looks like `{"written":2,"ignoredKeys":[]}`.

### Optional shorter build: loops (advanced)

Instead of 19 repeated blocks, use **Repeat with Each** over a **List** of the Health type names. Each iteration runs
Find Health Samples (Type = **Repeat Item**) and Calculate Statistics, then Set Dictionary Value using a key looked up
from a second list or a Dictionary that maps type name to key. It makes the Shortcut much shorter, but the type filter
has to accept a variable and the unit conversions in step 9 get harder, so build the long version first and
refactor only if you are comfortable with Shortcuts variables.

## Part 4: Automate it

1. Shortcuts app, **Automation** tab, **+**, **Create Personal Automation**.
2. Choose **Time of Day**. Set the time to 10:00, Repeat **Daily**. Tap Next.
3. Add action **Run Shortcut**, choose "Send nutrition". Tap Next.
4. Turn **Ask Before Running** OFF (the "Run Immediately" option) and **Notify When Run** OFF. Tap Done.
5. Repeat for 14:00, 19:00 and 23:30. The last one picks up your final entries before midnight; yesterday's pass fixes
   late edits the next day.

## Part 5: Test it

### With the local dev server (before the app is online)

The phone can reach your Mac's dev server over the same Wi-Fi.

1. On the Mac, find its LAN IP: `ipconfig getifaddr en0` (if empty, try `en1`).
2. Start the dev server so it listens on the network, for example `npm run dev -- -H 0.0.0.0`.
3. In the Shortcut use the URL `http://<mac-lan-ip>:3000/api/ingest/health`. iOS may ask permission for local network
   access: allow it.
4. Run the Shortcut once with the play button and check Show Result.

### Checking with curl from the Mac

Replace the placeholders; use invented numbers while testing, and note this will write a real row for that date, so
use a date you will delete or overwrite.

```sh
curl -i -X POST "http://localhost:3000/api/ingest/health" \
  -H "Authorization: Bearer <your token>" \
  -H "Content-Type: application/json" \
  -d '{"sentAt":"2026-01-15T19:00:00-06:00","days":[{"date":"2026-01-15","totals":{"energy_kcal":2100,"protein_g":120}}]}'
```

Expect `HTTP/1.1 200` and `{"written":1,"ignoredKeys":[]}`.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| **401 Unauthorized** | The token is missing or wrong. The header must be exactly `Authorization: Bearer <token>`, with one space and no quotes. Copy the token again from Settings, Nutrition (Reveal). Check there is no trailing space. |
| **413 Payload too large** | The body is over 64 KB. A normal payload is a few KB. Check that the body is the `payload` dictionary and not something huge (for example the raw Health samples were added instead of the Sum). |
| **400 Bad Request** | The message after "Invalid payload:" names the problem. Common causes: `sentAt` not ISO 8601 with a time zone offset; `date` not `yyyy-MM-dd`; more than 3 days; two entries with the same date; a value that is negative, not a number, or absurdly large (check the units in step 9, such as kJ or fluid ounces sent where kcal or mL are expected); the body is not valid JSON (Request Body must be JSON, not Form). |
| **A type name is not in the picker** | Health's own names differ from the table (they are best-known, not official). Open Find Health Samples, tap the Type value, and browse the Nutrition list. Pick the closest match (for example `Total Fat` may appear as `Fat, Total` and `Fiber` as `Dietary Fiber`; never use `Active Energy`, which is exercise burn, in place of `Dietary Energy`) and tell the maintainer which name you used so the table and guide can be corrected. |
| Totals are 0 but Cronometer shows food | Cronometer's Apple Health export for that nutrient is off, or iOS Health permission for it was denied. Fix in Cronometer, Settings, Apple Health, and in iOS Settings, Health, Data Access. |
| Water is far too big or small | Units: see step 9 and convert to milliliters. Also see the water source setting in the app so water is not counted twice. |
| Automation does not run | Personal automations need the phone unlocked or recently used on some iOS versions, and "Ask Before Running" must be off. Open the Automation tab and check each is enabled. |
| The numbers lag | Cronometer syncs to Health only while it can run; open Cronometer once, then run the Shortcut. |
