const sv: Record<string, string> = {
  // Booking confirmation
  "booking.confirmed.header": ":calendar: Huddle bokad!",
  "booking.confirmed.fallback":
    'Huddle "{{title}}" bokad den {{date}} kl {{time}}',
  "booking.confirmed.title_label": "Titel",
  "booking.confirmed.channel_label": "Kanal",
  "booking.confirmed.date_label": "Datum",
  "booking.confirmed.time_label": "Tid",
  "booking.confirmed.participants_label": "Deltagare",
  "booking.confirmed.recurrence_label": "Upprepning",
  "booking.confirmed.dm_reminder_label": "DM-påminnelse",
  "booking.confirmed.footer": "Bokad av <@{{creator}}> | ID: `{{id}}`",

  // Recurrence labels
  "recurrence.once": "En gång",
  "recurrence.daily": "Dagligen",
  "recurrence.weekly": "Varje vecka",

  // DM reminder labels
  "dm_reminder.none": "Nej",
  "dm_reminder.5": "5 min innan",
  "dm_reminder.10": "10 min innan",
  "dm_reminder.15": "15 min innan",
  "dm_reminder.30": "30 min innan",

  // Validation
  "validation.past_time": ":x: Tiden har redan passerat. Välj en framtida tid.",

  // Notification
  "notification.header": ":headphones: Dags för huddle!",
  "notification.body":
    "*{{title}}*\n\n{{mentions}}\n\nKlicka på :headphones:-ikonen i kanalens rubrik för att starta huddlen!",
  "notification.footer": "Bokad av <@{{creator}}>",
  "notification.fallback": "Dags för huddle: {{title}}! {{mentions}}",

  // DM reminder
  "dm_reminder.message":
    ":bell: Påminnelse: Huddle *{{title}}* börjar kl {{time}} i <#{{channel}}>!",

  // List
  "list.header": ":calendar: Kommande huddles",
  "list.empty": "Inga kommande huddles bokade i denna kanal.",
  "list.count_one": "1 kommande huddle",
  "list.count_many": "{{count}} kommande huddles",
  "list.fallback_one": "1 kommande huddle i denna kanal",
  "list.fallback_many": "{{count}} kommande huddles i denna kanal",

  // Cancel
  "cancel.not_found": ":x: Bokningen `{{id}}` hittades inte.",
  "cancel.already_cancelled":
    ':information_source: Bokningen "{{title}}" är redan avbokad.',
  "cancel.not_creator": ":x: Bara den som skapade bokningen kan avboka.",
  "cancel.confirmation":
    ":x: Huddle avbokad\n\n*{{title}}* den {{date}} kl {{time}} har avbokats av <@{{user}}>.",

  // Edit
  "edit.modal_title": "Redigera huddle",
  "edit.submit_label": "Spara",
  "edit.title_label": "Titel",
  "edit.channel_info": "Kanal: <#{{channel}}>",
  "edit.participants_label": "Deltagare",
  "edit.date_label": "Datum",
  "edit.time_label": "Tid",
  "edit.recurrence_label": "Upprepning",
  "edit.dm_reminder_label": "Påminnelse via DM",
  "edit.success": ':white_check_mark: Huddle "{{title}}" har uppdaterats.',
  "edit.not_found": ":x: Bokningen `{{id}}` hittades inte.",
  "edit.not_creator": ":x: Bara den som skapade bokningen kan redigera.",

  // Errors
  "error.send_message": "Kunde inte skicka meddelande: {{error}}",
  "error.create_trigger": "Kunde inte skapa påminnelse: {{error}}",
  "error.save_booking": "Kunde inte spara bokning: {{error}}",
  "error.send_confirmation": "Kunde inte skicka bekräftelse: {{error}}",
  "error.read_booking": "Kunde inte läsa bokning: {{error}}",
  "error.send_notification": "Kunde inte skicka påminnelse: {{error}}",
  "error.update_booking": "Kunde inte uppdatera bokning: {{error}}",
  "error.query_bookings": "Kunde inte hämta bokningar: {{error}}",
};

export default sv;
