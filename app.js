async function login(){

  const username =
    document.getElementById("username").value;

  const password =
    document.getElementById("password").value;

  const message =
    document.getElementById("message");

  message.innerText = "جاري تسجيل الدخول...";

  try{

    const response = await fetch(
      `${API_URL}?action=login&username=${username}&password=${password}`
    );

    const data = await response.json();

    if(data.success){

      localStorage.setItem(
        "currentUser",
        JSON.stringify(data.user)
      );

      message.innerText =
        "تم تسجيل الدخول";

      setTimeout(()=>{
        window.location.href="dashboard.html";
      },1000);

    }else{

      message.innerText =
        "اسم المستخدم أو كلمة المرور غير صحيحة";

    }

  }catch(err){

    message.innerText =
      "خطأ في الاتصال بالخادم";

  }

}
