const en: Record<string, string> = {
  // Booking confirmation
  "booking.confirmed.header": ":calendar: Huddle booked!",
  "booking.confirmed.fallback":
    'Huddle "{{title}}" booked on {{date}} at {{time}}',
  "booking.confirmed.title_label": "Title",
  "booking.confirmed.channel_label": "Channel",
  "booking.confirmed.date_label": "Date",
  "booking.confirmed.time_label": "Time",
  "booking.confirmed.participants_label": "Participants",
  "booking.confirmed.recurrence_label": "Recurrence",
  "booking.confirmed.dm_reminder_label": "DM reminder",
  "booking.confirmed.footer": "Booked by <@{{creator}}> | ID: `{{id}}`",

  // Recurrence labels
  "recurrence.once": "One-time",
  "recurrence.daily": "Daily",
  "recurrence.weekly": "Weekly",

  // DM reminder labels
  "dm_reminder.none": "No",
  "dm_reminder.5": "5 min before",
  "dm_reminder.10": "10 min before",
  "dm_reminder.15": "15 min before",
  "dm_reminder.30": "30 min before",

  // Validation
  "validation.past_time":
    ":x: This time has already passed. Please choose a future time.",

  // Notification
  "notification.header": ":headphones: Time for huddle!",
  "notification.body":
    "*{{title}}*\n\n{{mentions}}\n\nClick the :headphones: icon in the channel header to start the huddle!",
  "notification.footer": "Booked by <@{{creator}}>",
  "notification.fallback": "Time for huddle: {{title}}! {{mentions}}",

  // DM reminder
  "dm_reminder.message":
    ":bell: Reminder: Huddle *{{title}}* starts at {{time}} in <#{{channel}}>!",

  // List
  "list.header": ":calendar: Upcoming huddles",
  "list.empty": "No upcoming huddles booked in this channel.",
  "list.count_one": "1 upcoming huddle",
  "list.count_many": "{{count}} upcoming huddles",
  "list.fallback_one": "1 upcoming huddle in this channel",
  "list.fallback_many": "{{count}} upcoming huddles in this channel",

  // Cancel
  "cancel.not_found": ":x: Booking `{{id}}` not found.",
  "cancel.already_cancelled":
    ':information_source: Booking "{{title}}" is already cancelled.',
  "cancel.not_creator": ":x: Only the creator of the booking can cancel it.",
  "cancel.confirmation":
    ":x: Huddle cancelled\n\n*{{title}}* on {{date}} at {{time}} was cancelled by <@{{user}}>.",

  // Edit
  "edit.modal_title": "Edit huddle",
  "edit.submit_label": "Save",
  "edit.title_label": "Title",
  "edit.channel_info": "Channel: <#{{channel}}>",
  "edit.participants_label": "Participants",
  "edit.date_label": "Date",
  "edit.time_label": "Time",
  "edit.recurrence_label": "Recurrence",
  "edit.dm_reminder_label": "DM reminder",
  "edit.success": ':white_check_mark: Huddle "{{title}}" has been updated.',
  "edit.not_found": ":x: Booking `{{id}}` not found.",
  "edit.not_creator": ":x: Only the creator of the booking can edit it.",

  // Errors
  "error.send_message": "Could not send message: {{error}}",
  "error.create_trigger": "Could not create reminder: {{error}}",
  "error.save_booking": "Could not save booking: {{error}}",
  "error.send_confirmation": "Could not send confirmation: {{error}}",
  "error.read_booking": "Could not read booking: {{error}}",
  "error.send_notification": "Could not send notification: {{error}}",
  "error.update_booking": "Could not update booking: {{error}}",
  "error.query_bookings": "Could not fetch bookings: {{error}}",
};

export default en;
