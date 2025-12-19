from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import torch
from transformers import GPT2LMHeadModel, GPT2Tokenizer
from peft import PeftModel
import json
import re
from datetime import datetime, timedelta
import pytz
import calendar

app = FastAPI()

# CORS 설정 - React 앱에서 접근 가능하도록
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:5000"],  # Vite 포트
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 모델 로딩
print("Loading LoRA fine-tuned model...")
base_model_name = "gpt2"
lora_adapter_path = "./lora_finetuned"

tokenizer = GPT2Tokenizer.from_pretrained(lora_adapter_path)
base_model = GPT2LMHeadModel.from_pretrained(base_model_name)
model = PeftModel.from_pretrained(base_model, lora_adapter_path)
model.eval()

print("Model loaded successfully!")

# 한국 시간대 설정
KST = pytz.timezone('Asia/Seoul')


class ProcessRequest(BaseModel):
    text: str
    contextData: Dict[str, List[Any]]


class ProcessResponse(BaseModel):
    answer: str
    dataExtraction: Dict[str, List[Any]]
    usedModel: str
    canHandle: bool
    parseResult: Optional[str] = None
    processingDetails: str
    clarificationNeeded: Optional[bool] = False
    clarificationOptions: Optional[List[str]] = None

def convert_to_kst_date(date_str: str) -> str:
    """
    날짜 문자열을 한국 시간으로 변환
    UTC 날짜가 하루씩 밀리는 현상 방지
    """
    try:
        # YYYY-MM-DD 형식인 경우
        if re.match(r'\d{4}-\d{2}-\d{2}', date_str):
            # 이미 날짜만 있는 경우, KST로 간주
            return date_str

        # ISO 형식 날짜인 경우
        dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))

        # KST로 변환
        kst_dt = dt.astimezone(KST)

        return kst_dt.strftime('%Y-%m-%d')
    except:
        # 변환 실패시 원본 반환
        return date_str


def get_current_kst_datetime() -> dict:
    """현재 한국 시간 정보 반환"""
    now_kst = datetime.now(KST)
    return {
        'date': now_kst.strftime('%Y-%m-%d'),
        'time': now_kst.strftime('%H:%M'),
        'datetime': now_kst.strftime('%Y-%m-%d %H:%M'),
        'weekday': ['월', '화', '수', '목', '금', '토', '일'][now_kst.weekday()]
    }


def parse_relative_date(text: str) -> Optional[str]:
    """
    상대적 날짜 표현을 파싱하여 YYYY-MM-DD 형식으로 반환
    예: 다음주 금요일, 다음달 15일, 어제, 모레, 3일 전, 2주 후 등
    """
    now_kst = datetime.now(KST)

    # 어제, 오늘, 내일, 모레, 그저께
    if '그저께' in text or '그제' in text:
        target_date = now_kst - timedelta(days=2)
        return target_date.strftime('%Y-%m-%d')
    elif '어제' in text:
        target_date = now_kst - timedelta(days=1)
        return target_date.strftime('%Y-%m-%d')
    elif '오늘' in text:
        return now_kst.strftime('%Y-%m-%d')
    elif '내일' in text:
        target_date = now_kst + timedelta(days=1)
        return target_date.strftime('%Y-%m-%d')
    elif '모레' in text:
        target_date = now_kst + timedelta(days=2)
        return target_date.strftime('%Y-%m-%d')

    # N일 전/후 패턴
    days_pattern = re.search(r'(\d+)일\s*(전|후)', text)
    if days_pattern:
        days = int(days_pattern.group(1))
        direction = days_pattern.group(2)
        if direction == '전':
            target_date = now_kst - timedelta(days=days)
        else:  # 후
            target_date = now_kst + timedelta(days=days)
        return target_date.strftime('%Y-%m-%d')

    # N주 전/후 패턴
    weeks_pattern = re.search(r'(\d+)주\s*(전|후)', text)
    if weeks_pattern:
        weeks = int(weeks_pattern.group(1))
        direction = weeks_pattern.group(2)
        if direction == '전':
            target_date = now_kst - timedelta(weeks=weeks)
        else:  # 후
            target_date = now_kst + timedelta(weeks=weeks)
        return target_date.strftime('%Y-%m-%d')

    # 지난주/저번주/다음주/이번주 (요일 없이)
    # 특정 요일이 명시되지 않은 경우 처리
    if '지난주' in text or '저번주' in text:
        # 요일이 포함되어 있는지 확인
        has_weekday = any(day in text for day in ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'])
        if not has_weekday:
            # 지난주 월요일로 처리 (일주일 전)
            target_date = now_kst - timedelta(weeks=1)
            return target_date.strftime('%Y-%m-%d')
    elif '다음주' in text or '담주' in text:
        has_weekday = any(day in text for day in ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'])
        if not has_weekday:
            # 다음주 월요일로 처리 (일주일 후)
            target_date = now_kst + timedelta(weeks=1)
            return target_date.strftime('%Y-%m-%d')
    elif '이번주' in text:
        has_weekday = any(day in text for day in ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'])
        if not has_weekday:
            # 이번주는 현재 날짜 유지
            return now_kst.strftime('%Y-%m-%d')

    # 요일 기반 날짜 파싱
    weekday_map = {'월요일': 0, '화요일': 1, '수요일': 2, '목요일': 3, '금요일': 4, '토요일': 5, '일요일': 6}
    weekday_short_map = {'월': 0, '화': 1, '수': 2, '목': 3, '금': 4, '토': 5, '일': 6}

    # 다음주 / 이번주 / 지난주 요일
    for korean_day, target_weekday in weekday_map.items():
        if korean_day in text:
            current_weekday = now_kst.weekday()

            if '다음주' in text or '담주' in text:
                # 다음주의 해당 요일
                days_ahead = (target_weekday - current_weekday + 7) % 7
                if days_ahead == 0:
                    days_ahead = 7  # 같은 요일이면 다음주
                target_date = now_kst + timedelta(days=days_ahead + 7)
            elif '지난주' in text or '저번주' in text:
                # 지난주의 해당 요일
                days_behind = (current_weekday - target_weekday) % 7
                if days_behind == 0:
                    days_behind = 7  # 같은 요일이면 지난주
                target_date = now_kst - timedelta(days=days_behind + 7)
            elif '이번주' in text:
                # 이번주의 해당 요일
                days_ahead = (target_weekday - current_weekday) % 7
                if days_ahead == 0:
                    days_ahead = 7  # 이미 지났으면 다음주
                target_date = now_kst + timedelta(days=days_ahead)
            else:
                # 그냥 "금요일"만 있으면 가장 가까운 미래의 금요일
                days_ahead = (target_weekday - current_weekday) % 7
                if days_ahead == 0:
                    days_ahead = 7
                target_date = now_kst + timedelta(days=days_ahead)

            return target_date.strftime('%Y-%m-%d')

    # 짧은 요일 표현 (월, 화, 수 등)
    # 주의: "월급", "월말" 등과 구분하기 위해 단어 경계를 확인
    for short_day, target_weekday in weekday_short_map.items():
        # "다음주 금요일" 또는 "다음주 금일" 패턴 (뒤에 다른 글자가 오지 않아야 함)
        next_week_pattern = rf'(다음주|담주)\s*{short_day}(?![가-힣])'
        if re.search(next_week_pattern, text):
            current_weekday = now_kst.weekday()
            days_ahead = (target_weekday - current_weekday) % 7
            if days_ahead == 0:
                days_ahead = 7
            target_date = now_kst + timedelta(days=days_ahead + 7)
            return target_date.strftime('%Y-%m-%d')

        # "지난주 금요일" 또는 "지난주 금일" 패턴
        last_week_pattern = rf'(지난주|저번주)\s*{short_day}(?![가-힣])'
        if re.search(last_week_pattern, text):
            current_weekday = now_kst.weekday()
            days_behind = (current_weekday - target_weekday) % 7
            if days_behind == 0:
                days_behind = 7
            target_date = now_kst - timedelta(days=days_behind + 7)
            return target_date.strftime('%Y-%m-%d')

        # "이번주 금요일" 또는 "이번주 금일" 패턴
        this_week_pattern = rf'이번주\s*{short_day}(?![가-힣])'
        if re.search(this_week_pattern, text):
            current_weekday = now_kst.weekday()
            days_ahead = (target_weekday - current_weekday) % 7
            if days_ahead == 0:
                days_ahead = 7
            target_date = now_kst + timedelta(days=days_ahead)
            return target_date.strftime('%Y-%m-%d')

    # N개월 전/후 패턴
    months_pattern = re.search(r'(\d+)개?월\s*(전|후)', text)
    if months_pattern:
        months = int(months_pattern.group(1))
        direction = months_pattern.group(2)

        if direction == '전':
            # N개월 전
            target_month = now_kst.month - months
            target_year = now_kst.year
            while target_month <= 0:
                target_month += 12
                target_year -= 1
            # 해당 월의 마지막 날이 현재 날짜보다 작으면 조정
            max_day = calendar.monthrange(target_year, target_month)[1]
            target_day = min(now_kst.day, max_day)
            target_date = datetime(target_year, target_month, target_day, tzinfo=KST)
        else:  # 후
            # N개월 후
            target_month = now_kst.month + months
            target_year = now_kst.year
            while target_month > 12:
                target_month -= 12
                target_year += 1
            max_day = calendar.monthrange(target_year, target_month)[1]
            target_day = min(now_kst.day, max_day)
            target_date = datetime(target_year, target_month, target_day, tzinfo=KST)

        return target_date.strftime('%Y-%m-%d')

    # 다음달 / 이번달 / 지난달 N일
    month_day_match = re.search(r'(\d{1,2})일', text)
    if month_day_match:
        day = int(month_day_match.group(1))

        if '다음달' in text or '담달' in text:
            # 다음달
            if now_kst.month == 12:
                target_date = datetime(now_kst.year + 1, 1, day, tzinfo=KST)
            else:
                target_date = datetime(now_kst.year, now_kst.month + 1, day, tzinfo=KST)
            return target_date.strftime('%Y-%m-%d')
        elif '지난달' in text or '저번달' in text:
            # 지난달
            if now_kst.month == 1:
                target_date = datetime(now_kst.year - 1, 12, day, tzinfo=KST)
            else:
                target_date = datetime(now_kst.year, now_kst.month - 1, day, tzinfo=KST)
            return target_date.strftime('%Y-%m-%d')
        elif '이번달' in text:
            target_date = datetime(now_kst.year, now_kst.month, day, tzinfo=KST)
            return target_date.strftime('%Y-%m-%d')
    else:
        # 일자 없이 "지난달", "다음달", "이번달"만 있는 경우
        if '지난달' in text or '저번달' in text:
            # 지난달 같은 날짜
            if now_kst.month == 1:
                target_date = datetime(now_kst.year - 1, 12, now_kst.day, tzinfo=KST)
            else:
                # 지난달에 해당 날짜가 없을 수 있으므로 (예: 3월 31일 -> 2월 31일 없음)
                target_month = now_kst.month - 1
                max_day = calendar.monthrange(now_kst.year, target_month)[1]
                target_day = min(now_kst.day, max_day)
                target_date = datetime(now_kst.year, target_month, target_day, tzinfo=KST)
            return target_date.strftime('%Y-%m-%d')
        elif '다음달' in text or '담달' in text:
            # 다음달 같은 날짜
            if now_kst.month == 12:
                target_date = datetime(now_kst.year + 1, 1, now_kst.day, tzinfo=KST)
            else:
                target_month = now_kst.month + 1
                max_day = calendar.monthrange(now_kst.year, target_month)[1]
                target_day = min(now_kst.day, max_day)
                target_date = datetime(now_kst.year, target_month, target_day, tzinfo=KST)
            return target_date.strftime('%Y-%m-%d')
        elif '이번달' in text:
            return now_kst.strftime('%Y-%m-%d')

    # N월 M일 형식 (작년/내년/올해 포함)
    date_match = re.search(r'(\d{1,2})월\s*(\d{1,2})일', text)
    if date_match:
        month = int(date_match.group(1))
        day = int(date_match.group(2))
        year = now_kst.year

        if '작년' in text or '지난해' in text:
            year = now_kst.year - 1
        elif '내년' in text or '다음해' in text:
            year = now_kst.year + 1
        elif '올해' in text or '이번해' in text:
            year = now_kst.year
        else:
            # 연도 지정 없으면 이미 지난 날짜는 내년으로
            target_date = datetime(year, month, day, tzinfo=KST)
            if target_date < now_kst:
                year = now_kst.year + 1

        target_date = datetime(year, month, day, tzinfo=KST)
        return target_date.strftime('%Y-%m-%d')

    # 작년/내년/올해 (일자 없이)
    if '작년' in text or '지난해' in text:
        # 작년 오늘 날짜
        target_date = datetime(now_kst.year - 1, now_kst.month, now_kst.day, tzinfo=KST)
        return target_date.strftime('%Y-%m-%d')
    elif '내년' in text or '다음해' in text:
        # 내년 오늘 날짜
        target_date = datetime(now_kst.year + 1, now_kst.month, now_kst.day, tzinfo=KST)
        return target_date.strftime('%Y-%m-%d')

    return None


def extract_item_name(text: str) -> Optional[str]:
    """
    텍스트에서 항목명을 정확히 추출
    '오늘 국수 5000원 먹었어' -> '국수'
    '항목'이나 일반적인 단어가 아닌 실제 항목명 추출
    """
    # '항목', '내역', '이름' 등의 일반 단어는 제외
    exclude_words = [
        '항목', '내역', '이름', '금액', '비용', '가격', '돈', '원',
        '오늘', '어제', '내일', '모레', '그저께',
        '다음주', '이번주', '지난주', '저번주',
        '다음달', '이번달', '지난달', '저번달',
        '작년', '내년', '올해', '지난해', '다음해', '이번해',
        '먹었어', '샀어', '구매', '지출', '수입', '받았어', '냈어',
        '교통비', '식비'  # 카테고리 이름도 제외
    ]

    # 숫자와 '원' 제거
    text_cleaned = re.sub(r'\d+원?', '', text)

    # 날짜 관련 단어 제거 (더 포괄적으로)
    text_cleaned = re.sub(r'(오늘|어제|내일|모레|그저께)', '', text_cleaned)
    text_cleaned = re.sub(r'(다음주|이번주|지난주|저번주)', '', text_cleaned)
    text_cleaned = re.sub(r'(다음달|이번달|지난달|저번달)', '', text_cleaned)
    text_cleaned = re.sub(r'(작년|내년|올해|지난해|다음해|이번해)', '', text_cleaned)
    text_cleaned = re.sub(r'\d+일\s*(전|후)', '', text_cleaned)
    text_cleaned = re.sub(r'\d+주\s*(전|후)', '', text_cleaned)
    text_cleaned = re.sub(r'\d+개?월\s*(전|후)', '', text_cleaned)
    text_cleaned = re.sub(r'\d{1,2}월\s*\d{1,2}일', '', text_cleaned)

    # 동사 제거 (먹었어, 샀어 등)
    text_cleaned = re.sub(r'(먹었어|샀어|구매했어|지출했어|받았어|냈어|했어)', '', text_cleaned)

    # 공백으로 분리
    words = text_cleaned.split()

    # 제외 단어가 아닌 첫 번째 단어를 항목명으로 사용
    for word in words:
        word = word.strip()
        if word and word not in exclude_words and len(word) > 1:
            return word

    return None


def can_handle_locally(text: str) -> tuple[bool, str]:
    """
    로컬 모델이 처리할 수 있는지 판단
    Returns: (can_handle: bool, reason: str)
    """
    text_lower = text.lower()

    # OCR이 필요한 경우
    if '영수증' in text or '사진' in text or '이미지' in text:
        return False, "OCR 처리 필요 - Gemini로 전달"

    # 수정/삭제 의도 감지 - 로컬 모델은 dataModification/dataDeletion 미지원
    modification_keywords = ['수정', '변경', '바꿔', '고쳐']
    deletion_keywords = ['삭제', '지워', '제거']

    if any(keyword in text for keyword in modification_keywords):
        return False, "데이터 수정 요청 - Gemini로 전달"

    if any(keyword in text for keyword in deletion_keywords):
        return False, "데이터 삭제 요청 - Gemini로 전달"

    # 웹 검색이 필요한 경우
    web_search_keywords = ['날씨', '뉴스', '검색', '찾아줘', '알려줘 (일반 정보)', 'gta6', '발매일']
    if any(keyword in text for keyword in web_search_keywords):
        # 단, 개인 데이터 검색은 로컬에서 처리 가능
        personal_data_keywords = ['일정', '연락처', '가계부', '메모', '다이어리']
        if not any(keyword in text for keyword in personal_data_keywords):
            return False, "웹 검색 필요 - Gemini로 전달"

    # 복잡한 대화나 질문
    if '?' in text and len(text) > 50:
        return False, "복잡한 질문 - Gemini로 전달"

    # 로컬 모델이 처리 가능한 키워드 (새로운 데이터 생성만)
    local_keywords = ['일정', '연락처', '가계부', '메모', '다이어리', '저장', '추가', '등록',
                     '예약', '약속', '미팅', '회의', '지출', '수입',
                     '먹었어', '샀어', '구매', '만났어']

    if any(keyword in text for keyword in local_keywords):
        return True, "로컬 모델에서 처리 가능"

    # 간단한 데이터 입력 패턴 (숫자 + 원)
    if re.search(r'\d+원', text):
        return True, "가계부 데이터 - 로컬 모델에서 처리"

    # 날짜 패턴이 있는 경우
    if re.search(r'\d{1,2}월|\d{1,2}일|오늘|내일|어제', text):
        return True, "날짜 데이터 - 로컬 모델에서 처리"

    return False, "키워드 미발견 - Gemini로 전달"


def process_with_local_model(text: str, context_data: Dict[str, List[Any]]) -> Dict[str, Any]:
    """
    로컬 LoRA 모델로 텍스트 처리
    """
    current_time = get_current_kst_datetime()

    # 프롬프트 구성
    prompt = f"""현재 시간: {current_time['datetime']} ({current_time['weekday']})
사용자 입력: {text}

다음 정보를 추출하여 JSON 형식으로 반환하세요:
- 일정 (schedule): title, date (YYYY-MM-DD), time (HH:MM)
- 연락처 (contacts): name, phone, email, group
- 지출/수입 (expenses): date (YYYY-MM-DD), item, amount, type (expense/income), category
- 메모/다이어리 (diary): date (YYYY-MM-DD), entry, group

응답:"""

    # 토크나이저로 인코딩
    inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=512)

    # 모델 추론
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=256,
            temperature=0.7,
            do_sample=True,
            top_p=0.9,
            pad_token_id=tokenizer.eos_token_id
        )

    # 디코딩
    generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)

    # 프롬프트 이후의 응답만 추출
    response_text = generated_text[len(prompt):].strip()

    # JSON 파싱 시도
    try:
        # JSON 부분 추출 (중괄호 사이)
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            json_str = json_match.group()
            parsed_data = json.loads(json_str)
        else:
            # JSON이 없으면 바로 fallback으로
            parsed_data = fallback_text_parsing(text, current_time, context_data)
    except json.JSONDecodeError:
        # JSON 파싱 실패시 텍스트 분석으로 폴백
        print("[디버그] JSON 파싱 실패 - fallback_text_parsing 사용")
        parsed_data = fallback_text_parsing(text, current_time)

    # 날짜를 KST로 변환
    if 'expenses' in parsed_data:
        for expense in parsed_data['expenses']:
            if 'date' in expense:
                expense['date'] = convert_to_kst_date(expense['date'])
            # 항목명 정확히 추출
            if 'item' in expense and expense['item'] in ['항목', '내역', '이름']:
                extracted_item = extract_item_name(text)
                if extracted_item:
                    expense['item'] = extracted_item

    if 'schedule' in parsed_data:
        for schedule in parsed_data['schedule']:
            if 'date' in schedule:
                schedule['date'] = convert_to_kst_date(schedule['date'])

    if 'diary' in parsed_data:
        for diary in parsed_data['diary']:
            if 'date' in diary:
                diary['date'] = convert_to_kst_date(diary['date'])

    # fallback에서 온 clarification 정보 확인
    clarification_needed = parsed_data.get('clarification_needed', False)
    clarification_question = parsed_data.get('clarification_question', None)
    clarification_options = parsed_data.get('clarification_options', None)
    ambiguous_time = None
    ambiguous_categories = parsed_data.get('ambiguous_categories', [])

    # fallback의 메타데이터 제거 (실제 데이터만 남김)
    if 'clarification_needed' in parsed_data:
        del parsed_data['clarification_needed']
    if 'clarification_question' in parsed_data:
        del parsed_data['clarification_question']
    if 'clarification_options' in parsed_data:
        del parsed_data['clarification_options']
    if 'ambiguous_categories' in parsed_data:
        del parsed_data['ambiguous_categories']

    # 애매한 시간 감지 (1-12시) - clarification이 아직 없는 경우만
    if not clarification_needed and 'schedule' in parsed_data and parsed_data['schedule']:
        for schedule in parsed_data['schedule']:
            if 'time' in schedule:
                time_parts = schedule['time'].split(':')
                if time_parts:
                    hour = int(time_parts[0])
                    if 1 <= hour <= 12:
                        # 애매한 시간 발견
                        clarification_needed = True
                        ambiguous_time = hour
                        clarification_question = f"{hour}시가 오전인가요, 오후인가요?"
                        clarification_options = ["오전", "오후"]
                        break

    return {
        'raw_response': response_text,
        'parsed_data': parsed_data,
        'clarification_needed': clarification_needed,
        'clarification_question': clarification_question,
        'clarification_options': clarification_options,
        'ambiguous_time': ambiguous_time,
        'ambiguous_categories': ambiguous_categories
    }


def fallback_text_parsing(text: str, current_time: dict, context_data: Dict[str, List[Any]] = None) -> Dict[str, Any]:
    """
    모델 응답이 JSON이 아닐 때 텍스트 파싱으로 폴백
    """
    if context_data is None:
        context_data = {'contacts': [], 'schedule': [], 'expenses': [], 'diary': []}

    result = {
        'contacts': [],
        'schedule': [],
        'expenses': [],
        'diary': [],
        'clarification_needed': False,
        'clarification_question': None,
        'clarification_options': None,
        'ambiguous_categories': []
    }

    # 🚨 개선된 멀티모달 패턴 감지
    # 패턴 1: "[소스카테고리]의 [내용]을/를 [목적카테고리]에 저장"
    # 패턴 2: "[소스카테고리] [내용]을/를 [목적카테고리]에 저장"
    # 패턴 3: "[내용]을/를 [목적카테고리]에 저장" (소스 카테고리 자동 감지)

    category_keywords = {
        '메모': ['메모장', '메모', '다이어리', '일기', '기록'],
        '일정': ['일정', '스케줄', '약속', '예약'],
        '가계부': ['가계부', '지출', '수입', '경비'],
        '주소록': ['주소록', '연락처', '전화번호']
    }

    # 모든 카테고리 키워드를 하나의 패턴으로 결합
    all_categories = []
    for keywords in category_keywords.values():
        all_categories.extend(keywords)
    category_pattern = '|'.join(all_categories)

    # 더 유연한 패턴 매칭
    patterns = [
        # 패턴 1: [카테고리]의 [내용]을/를 [카테고리]에 저장
        rf'\[?({category_pattern})\]?의\s*\[?(.+?)\]?(를|을)\s*\[?({category_pattern})\]?에?\s*(저장|추가|등록)',
        # 패턴 2: [카테고리] [내용]을/를 [카테고리]에 저장
        rf'\[?({category_pattern})\]?\s+(.+?)(를|을)\s*\[?({category_pattern})\]?에?\s*(저장|추가|등록)',
        # 패턴 3: [내용]을/를 [카테고리]에 저장 (원래 패턴)
        rf'(.+?)(를|을)\s*\[?({category_pattern})\]?에?\s*(저장|추가|등록)',
        # 패턴 4: [카테고리]에 [내용] [카테고리]에 저장 ("를/을" 없이)
        rf'\[?({category_pattern})\]?에\s+(.+?)\s+\[?({category_pattern})\]?에\s*(저장|추가|등록)'
    ]

    matched = False
    for i, pattern in enumerate(patterns):
        cross_ref_match = re.search(pattern, text)
        if cross_ref_match:
            matched = True

            if i == 0:  # 패턴 1: [카테고리]의 [내용]을 [카테고리]에
                source_category = cross_ref_match.group(1).strip()
                source_text = cross_ref_match.group(2).strip()
                destination = cross_ref_match.group(4).strip()
            elif i == 1:  # 패턴 2: [카테고리] [내용]을 [카테고리]에
                source_category = cross_ref_match.group(1).strip()
                source_text = cross_ref_match.group(2).strip()
                destination = cross_ref_match.group(4).strip()
            elif i == 2:  # 패턴 3: [내용]을 [카테고리]에 (소스 카테고리 자동 감지)
                source_category = None
                source_text = cross_ref_match.group(1).strip()
                destination = cross_ref_match.group(3).strip()
            elif i == 3:  # 패턴 4: [카테고리]에 [내용] [카테고리]에 저장
                source_category = cross_ref_match.group(1).strip()
                source_text = cross_ref_match.group(2).strip()
                destination = cross_ref_match.group(3).strip()

            print(f"[멀티모달 감지] 소스 카테고리: '{source_category}', 내용: '{source_text}' → 목적지: '{destination}'")

            found_item = None
            found_data = None  # 찾은 원본 데이터 전체

            # 소스 카테고리가 명시된 경우, 해당 카테고리에서만 검색
            # 명시되지 않은 경우, 모든 카테고리에서 검색

            # 정규화 함수 (카테고리 키워드를 표준 이름으로 변환)
            def normalize_category(cat):
                for std_name, keywords in category_keywords.items():
                    if cat in keywords:
                        return std_name
                return None

            search_categories = []
            if source_category:
                normalized = normalize_category(source_category)
                if normalized:
                    search_categories.append(normalized)
            else:
                # 소스 카테고리 미지정시 모든 카테고리에서 검색
                search_categories = ['가계부', '주소록', '일정', '메모']

            # 각 카테고리에서 데이터 검색
            for search_cat in search_categories:
                if found_item:
                    break

                # 가계부 검색
                if search_cat == '가계부' and context_data.get('expenses'):
                    # 금액 패턴 매칭
                    amount_match = re.search(r'(\d+)원', source_text)
                    item_name_in_source = re.sub(r'\d+원', '', source_text).strip()

                    for expense in context_data['expenses']:
                        item_name = expense.get('item', '')
                        amount = expense.get('amount', 0)

                        # 유연한 매칭: 부분 문자열 또는 금액이 일치하면 OK
                        name_match = (item_name_in_source and item_name and
                                     (item_name_in_source.lower() in item_name.lower() or
                                      item_name.lower() in item_name_in_source.lower()))
                        amount_value_match = amount_match and int(amount_match.group(1)) == amount

                        if (name_match and amount_value_match) or (name_match and not amount_match) or (amount_value_match and not item_name_in_source):
                            found_item = f"{item_name} {amount}원"
                            found_data = expense.copy()
                            print(f"[멀티모달 발견] 가계부에서 찾음: {found_item}")
                            break

                # 주소록 검색
                elif search_cat == '주소록' and context_data.get('contacts'):
                    for contact in context_data['contacts']:
                        name = contact.get('name', '')
                        phone = contact.get('phone', '')
                        email = contact.get('email', '')

                        # 이름, 전화번호, 이메일 중 하나라도 매칭되면 OK
                        if (name and name in source_text) or \
                           (phone and phone in source_text) or \
                           (email and email in source_text):
                            found_item = f"{name} {phone or email}".strip()
                            found_data = contact.copy()
                            print(f"[멀티모달 발견] 주소록에서 찾음: {found_item}")
                            break

                # 일정 검색
                elif search_cat == '일정' and context_data.get('schedule'):
                    for schedule in context_data['schedule']:
                        title = schedule.get('title', '')
                        date = schedule.get('date', '')
                        time = schedule.get('time', '')

                        # 제목이나 날짜가 매칭되면 OK
                        if (title and title in source_text) or (source_text in title):
                            found_item = f"{title} {date} {time}".strip()
                            found_data = schedule.copy()
                            print(f"[멀티모달 발견] 일정에서 찾음: {found_item}")
                            break

                # 메모 검색
                elif search_cat == '메모' and context_data.get('diary'):
                    for diary in context_data['diary']:
                        entry = diary.get('entry', '')

                        # 메모 내용이 부분적으로라도 일치하면 OK
                        if (entry and source_text in entry) or (entry and entry in source_text):
                            found_item = entry
                            found_data = diary.copy()
                            print(f"[멀티모달 발견] 메모에서 찾음: {found_item}")
                            break

            # 기존 데이터를 찾았으면 목적지에만 저장
            if found_item:
                print(f"[멀티모달 처리] '{found_item}'을(를) '{destination}'에 저장")

                # 목적지 카테고리 정규화
                dest_normalized = normalize_category(destination)

                # 목적지에 따라 저장
                if dest_normalized == '메모':
                    result['diary'].append({
                        'date': current_time['date'],
                        'entry': found_item,
                        'group': '기타'
                    })
                    return result

                elif dest_normalized == '일정':
                    result['schedule'].append({
                        'title': found_item,
                        'date': current_time['date']
                    })
                    return result

                elif dest_normalized == '가계부':
                    # 금액 추출 시도
                    amount_parse = re.search(r'(\d+)원', found_item)
                    if amount_parse:
                        result['expenses'].append({
                            'date': current_time['date'],
                            'item': re.sub(r'\s*\d+원', '', found_item).strip(),
                            'amount': int(amount_parse.group(1)),
                            'type': 'expense',
                            'category': '기타'
                        })
                    return result

                elif dest_normalized == '주소록':
                    # 전화번호 파싱
                    phone_parse = re.search(r'(010[-\s]?\d{4}[-\s]?\d{4})', found_item)
                    if phone_parse:
                        name = re.sub(r'010[-\s]?\d{4}[-\s]?\d{4}', '', found_item).strip()
                        result['contacts'].append({
                            'name': name or '이름 없음',
                            'phone': phone_parse.group(1)
                        })
                    return result

            # 패턴은 매칭되었지만 데이터를 찾지 못한 경우
            if matched:
                print(f"[멀티모달 경고] 패턴은 감지되었으나 '{source_text}'에 해당하는 데이터를 찾지 못했습니다.")
                break

    # 연락처 패턴 감지
    contact_keywords = ['연락처', '주소록', '전화번호', '번호']
    if any(keyword in text for keyword in contact_keywords):
        # 전화번호 패턴 (010-xxxx-xxxx 또는 01xxxxxxxxx)
        phone_match = re.search(r'(010[-\s]?\d{4}[-\s]?\d{4})', text)
        if phone_match:
            phone_raw = phone_match.group(1)
            # 숫자만 추출 후 포맷팅
            phone_digits = re.sub(r'[^\d]', '', phone_raw)
            phone = f"{phone_digits[:3]}-{phone_digits[3:7]}-{phone_digits[7:]}"

            # 이름 추출 (전화번호 앞의 한글 2-4자)
            name_match = re.search(r'([가-힣]{2,4})\s*' + re.escape(phone_raw), text)
            if name_match:
                name = name_match.group(1)
            else:
                # 전화번호 앞 단어에서 이름 찾기
                words = re.findall(r'[가-힣]{2,4}', text)
                name = words[0] if words else "연락처"

            contact_data = {
                'name': name,
                'phone': phone,
                'group': '기타'
            }
            result['contacts'].append(contact_data)

    # 가계부 패턴 감지
    expense_match = re.search(r'(\d+)원', text)
    if expense_match:
        amount = int(expense_match.group(1))

        # 항목명 추출
        item = extract_item_name(text) or "지출 항목"

        # 수입/지출 구분
        transaction_type = 'income' if any(word in text for word in ['받았어', '수입', '월급', '급여']) else 'expense'

        # 카테고리 자동 분류
        category = '기타'
        if any(word in text for word in ['먹었어', '식사', '음식', '밥', '국수', '저녁', '점심', '아침', '식비']):
            category = '식비'
        elif any(word in text for word in ['교통비', '버스', '지하철', '택시', '기름', '주유', '교통']):
            category = '교통'
        elif any(word in text for word in ['쇼핑', '옷', '구매', '샀어']):
            category = '쇼핑'
        elif any(word in text for word in ['월급', '급여', '수입', '용돈']):
            category = '급여'

        # 날짜 추출 (상대적 날짜 파싱 사용)
        expense_date = parse_relative_date(text)
        if not expense_date:
            expense_date = current_time['date']

        expense_data = {
            'date': expense_date,
            'item': item,
            'amount': amount,
            'type': transaction_type,
            'category': category
        }
        result['expenses'].append(expense_data)

    # 일정 패턴 감지
    if any(word in text for word in ['일정', '예약', '약속', '미팅', '회의', '있어', '있다']):
        # 날짜 추출 (상대적 날짜 파싱 사용)
        date_str = parse_relative_date(text)
        if not date_str:
            date_str = current_time['date']

        # 시간 추출
        time_match = re.search(r'(\d{1,2})시', text)
        time_str = None
        if time_match:
            hour = int(time_match.group(1))
            # 1-12시는 애매함 (오전/오후 불분명)
            # 13-23시는 명확함 (오후)
            # 0시, 24시는 자정
            if 1 <= hour <= 12:
                # 애매한 시간 - 일단 그대로 저장 (나중에 clarification으로 처리)
                time_str = f"{hour:02d}:00"
            elif hour == 0 or hour == 24:
                time_str = "00:00"
            elif 13 <= hour <= 23:
                time_str = f"{hour:02d}:00"

        # 제목 추출 (키워드 및 조사 제거)
        title = text

        # 날짜 키워드 제거
        for keyword in ['오늘', '내일', '모레', '어제', '그저께',
                        '다음주', '이번주', '지난주', '저번주',
                        '다음달', '이번달', '지난달', '저번달',
                        '작년', '내년', '올해', '지난해', '다음해', '이번해']:
            title = title.replace(keyword, '')

        # 날짜 패턴 제거
        title = re.sub(r'\d{1,2}월\s*\d{1,2}일', '', title)
        title = re.sub(r'\d{1,2}시', '', title)
        title = re.sub(r'\d+일\s*(전|후)', '', title)
        title = re.sub(r'\d+주\s*(전|후)', '', title)
        title = re.sub(r'\d+개?월\s*(전|후)', '', title)

        # 요일 제거 (긴 형태 먼저)
        for day in ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일']:
            title = title.replace(day, '')

        # 일정 관련 동사/조사 제거
        title = re.sub(r'(있어|있다|있음|합니다)', '', title)

        # 조사 제거 (에, 에서, 을, 를, 이, 가)
        title = re.sub(r'\s*(에서|에|을|를|이|가)\s*', ' ', title)

        # 불필요한 공백 정리
        title = ' '.join(title.split())
        title = title.strip()

        # 제목이 비어있거나 너무 짧으면 원본 텍스트에서 명사 추출 시도
        if not title or len(title) < 2:
            # 일정/예약/약속/미팅/회의 등의 단어 찾기
            for keyword in ['프로젝트', '회의', '미팅', '약속', '일정', '예약']:
                if keyword in text:
                    title = keyword
                    break

        # 여전히 비어있으면 원본 텍스트 일부 사용
        if not title:
            title = text[:20]

        schedule_data = {
            'title': title,
            'date': date_str,
        }
        if time_str:
            schedule_data['time'] = time_str

        result['schedule'].append(schedule_data)

    # 메모/다이어리 패턴 감지
    memo_keywords = ['메모', '메모장', '다이어리', '일기', '기록']
    if any(keyword in text for keyword in memo_keywords):
        # 날짜 추출
        diary_date = parse_relative_date(text)
        if not diary_date:
            diary_date = current_time['date']

        # 메모 내용 추출
        entry = text

        # "X를/을 메모장에/메모에/다이어리에 저장해줘" 패턴 감지
        save_pattern = re.search(r'(.+?)[을를]\s*(메모장|메모|다이어리|일기|기록)에?\s*(저장|추가|등록|남겨|적어|써)', text)
        if save_pattern:
            # 패턴이 매칭되면 첫 번째 그룹(내용 부분)만 추출
            entry = save_pattern.group(1).strip()
        else:
            # 기존 로직: 키워드 제거 (긴 키워드부터 먼저 제거)
            # 단, 저장 대상을 나타내는 "~에/~로" 뒤의 키워드만 제거
            # "메모장 9000원"에서 '메모장'은 내용이므로 보존

            # 저장 관련 어미 제거
            entry = re.sub(r'(에|로)?\s*(저장해줘|저장|적어줘|남겨줘|써줘|추가해줘|등록해줘)', '', entry)

            # "메모장에", "다이어리에" 같은 저장 대상 표현 제거
            entry = re.sub(r'(메모장|다이어리|메모|일기|기록)(에|로)\s*', '', entry)

            # 날짜 키워드 제거
            for date_keyword in ['오늘', '내일', '어제', '모레', '그저께',
                                 '다음주', '이번주', '지난주', '저번주',
                                 '다음달', '이번달', '지난달', '저번달']:
                entry = entry.replace(date_keyword, '')

            # 날짜 패턴 제거
            entry = re.sub(r'\d{1,2}월\s*\d{1,2}일', '', entry)
            entry = re.sub(r'\d+일\s*(전|후)', '', entry)
            entry = re.sub(r'\d+주\s*(전|후)', '', entry)

            # 조사 제거
            entry = re.sub(r'\s*(을|를|이|가)\s*', ' ', entry)

            # "메모:" 형식 처리
            if ':' in entry:
                parts = entry.split(':', 1)
                if len(parts) == 2:
                    entry = parts[1].strip()

        # 공백 정리
        entry = ' '.join(entry.split())
        entry = entry.strip()

        # 메모 내용이 있으면 저장
        if entry and len(entry) >= 1:
            diary_data = {
                'date': diary_date,
                'entry': entry,
                'group': '기타'
            }
            result['diary'].append(diary_data)

    # 여러 카테고리가 동시에 파싱된 경우 확인 요청
    parsed_categories = []
    if result['contacts']:
        parsed_categories.append('연락처')
    if result['schedule']:
        parsed_categories.append('일정')
    if result['expenses']:
        parsed_categories.append('가계부')
    if result['diary']:
        parsed_categories.append('메모')

    # 2개 이상 카테고리가 파싱된 경우
    if len(parsed_categories) >= 2:
        result['clarification_needed'] = True
        result['clarification_question'] = f"입력하신 내용이 {', '.join(parsed_categories)}로 파싱되었습니다. 어디에 저장할까요?"
        result['clarification_options'] = parsed_categories
        result['ambiguous_categories'] = parsed_categories

    return result


@app.post("/api/process", response_model=ProcessResponse)
async def process_text(request: ProcessRequest):
    """
    텍스트 처리 API
    """
    try:
        print(f"\n{'='*60}")
        print(f"[요청 수신] 사용자 입력: {request.text}")

        # 1. 로컬 모델이 처리 가능한지 판단
        can_handle, reason = can_handle_locally(request.text)
        print(f"[판단 결과] {reason}")

        if not can_handle:
            # 로컬 모델로 처리 불가능
            print(f"[모델 선택] Gemini API로 전달 필요")
            return ProcessResponse(
                answer="",
                dataExtraction={
                    'contacts': [],
                    'schedule': [],
                    'expenses': [],
                    'diary': []
                },
                usedModel="gemini-fallback-required",
                canHandle=False,
                parseResult=None,
                processingDetails=reason
            )

        # 2. 로컬 모델로 처리
        print(f"[모델 선택] 로컬 LoRA 모델 사용")
        result = process_with_local_model(request.text, request.contextData)

        print(f"[파싱 결과] {json.dumps(result['parsed_data'], ensure_ascii=False, indent=2)}")

        # 3. 응답 생성
        parsed_data = result['parsed_data']

        # 파싱 결과가 비어있는지 확인
        has_data = any([
            parsed_data.get('expenses'),
            parsed_data.get('schedule'),
            parsed_data.get('contacts'),
            parsed_data.get('diary')
        ])

        # 파싱 실패시 Gemini로 폴백
        if not has_data:
            print(f"[파싱 실패] 데이터 추출 실패 - Gemini로 폴백")
            print(f"{'='*60}\n")
            return ProcessResponse(
                answer="",
                dataExtraction={
                    'contacts': [],
                    'schedule': [],
                    'expenses': [],
                    'diary': []
                },
                usedModel="local-lora-gpt2",
                canHandle=False,  # 파싱 실패 → Gemini로 전달
                parseResult=result['raw_response'][:200],
                processingDetails="파싱 실패 - Gemini로 전달"
            )

        # 확인 필요 (애매한 시간 또는 여러 카테고리)
        if result.get('clarification_needed'):
            print(f"[확인 필요] {result['clarification_question']}")
            print(f"{'='*60}\n")

            # 처리 내역 메시지 생성
            if result.get('ambiguous_time'):
                processing_msg = f"애매한 시간 감지: {result['ambiguous_time']}시"
            elif result.get('ambiguous_categories'):
                processing_msg = f"여러 카테고리 파싱: {', '.join(result['ambiguous_categories'])}"
            else:
                processing_msg = "확인 필요"

            return ProcessResponse(
                answer=result['clarification_question'],
                dataExtraction=parsed_data,
                usedModel="local-lora-gpt2",
                canHandle=True,
                parseResult=result['raw_response'][:200],
                processingDetails=processing_msg,
                clarificationNeeded=True,
                clarificationOptions=result.get('clarification_options', [])
            )

        # 응답 메시지 생성
        answer_parts = []
        if parsed_data.get('expenses'):
            for exp in parsed_data['expenses']:
                answer_parts.append(f"{exp.get('item', '항목')} {exp.get('amount', 0):,}원이 {exp.get('type', 'expense') == 'expense' and '지출로' or '수입으로'} 저장되었습니다.")
        if parsed_data.get('schedule'):
            for sch in parsed_data['schedule']:
                answer_parts.append(f"{sch.get('title', '일정')}이(가) {sch.get('date')}에 등록되었습니다.")
        if parsed_data.get('contacts'):
            for con in parsed_data['contacts']:
                answer_parts.append(f"{con.get('name', '연락처')}이(가) 저장되었습니다.")
        if parsed_data.get('diary'):
            for dia in parsed_data['diary']:
                answer_parts.append(f"메모가 저장되었습니다.")

        answer = ' '.join(answer_parts) if answer_parts else "입력을 처리했습니다."

        processing_details = f"로컬 LoRA 모델로 처리 완료. 추출된 데이터: {len(parsed_data.get('expenses', []))}개 지출/수입, {len(parsed_data.get('schedule', []))}개 일정, {len(parsed_data.get('contacts', []))}개 연락처, {len(parsed_data.get('diary', []))}개 메모"

        print(f"[답변] {answer}")
        print(f"[처리 내역] {processing_details}")
        print(f"{'='*60}\n")

        return ProcessResponse(
            answer=answer,
            dataExtraction=parsed_data,
            usedModel="local-lora-gpt2",
            canHandle=True,
            parseResult=result['raw_response'][:200],  # 처음 200자만
            processingDetails=processing_details
        )

    except Exception as e:
        print(f"[오류] {str(e)}")
        raise HTTPException(status_code=500, detail=f"처리 중 오류 발생: {str(e)}")


@app.get("/api/health")
async def health_check():
    """서버 상태 확인"""
    return {
        "status": "healthy",
        "model": "local-lora-gpt2",
        "adapter_path": lora_adapter_path
    }


if __name__ == "__main__":
    import uvicorn
    print("\n🚀 LifeONE Local Model Server Starting...")
    print(f"📍 Server will run on: http://localhost:8000")
    print(f"🤖 Model: GPT-2 + LoRA Fine-tuned")
    print(f"📁 Adapter path: {lora_adapter_path}\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)
