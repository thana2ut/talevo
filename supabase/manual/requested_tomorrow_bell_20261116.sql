-- Adds one bell notification only to the account requested by its owner.
-- Does not change schedules or send to other accounts. Re-running does not duplicate it.
insert into public.notifications(user_id,id,type,priority,title,message,created_at,href,event_key,metadata)
values ('1e7ab1d6-808e-4709-80cf-c9f1d4401eb9','requested-next-day-20261116','system','normal',
'พรุ่งนี้มีเรียน 2 วิชา · จันทร์ 16 พ.ย. 2569',
E'08:00–12:00 วิทยาการหุ่นยนต์เบื้องต้นเพื่อการศึกษา\nห้อง 5506 · IT\n\n13:00–17:00 การวัดและประเมินผลการเรียนรู้\nห้อง EDU-3902\n\nรวมเวลาเรียน 8 ชั่วโมง ตามตารางภาคเรียนที่ 2 ปีการศึกษา 2569',
now(),'/schedule?date=2026-11-16','requested-next-day-20261116','{"date":"2026-11-16","requested_by_owner":true}'::jsonb)
on conflict (user_id,id) do nothing;
